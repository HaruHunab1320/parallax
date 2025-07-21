"""Base agent class for Parallax Python SDK."""

import asyncio
import json
import logging
import os
import signal
import sys
from abc import ABC, abstractmethod
from concurrent import futures
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import grpc

from .types import AnalyzeResult, Capabilities, HealthStatus

# Proto imports will be generated
try:
    import sys
    import os
    from pathlib import Path
    # Add generated directory to path
    generated_path = Path(__file__).parent.parent.parent / "generated"
    sys.path.insert(0, str(generated_path))
    import confidence_pb2
    import confidence_pb2_grpc
    import registry_pb2
    import registry_pb2_grpc
    from google.protobuf import empty_pb2, struct_pb2, timestamp_pb2
except ImportError:
    # Proto files not generated yet
    confidence_pb2 = None
    confidence_pb2_grpc = None
    registry_pb2 = None
    registry_pb2_grpc = None

logger = logging.getLogger(__name__)


class ParallaxAgent(ABC):
    """Base class for Parallax agents in Python."""
    
    def __init__(
        self,
        agent_id: str,
        name: str,
        capabilities: List[str],
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Initialize a Parallax agent.
        
        Args:
            agent_id: Unique identifier for this agent
            name: Human-readable name
            capabilities: List of capabilities this agent provides
            metadata: Optional metadata (expertise, capability_scores, etc.)
        """
        # Initialize gRPC-related attributes
        self._registry_stub: Optional[registry_pb2_grpc.RegistryStub] = None
        self._lease_id: Optional[str] = None
        self._renewal_task: Optional[asyncio.Task] = None
        self._port: int = 0
        self.id = agent_id
        self.name = name
        self.capabilities = capabilities
        self.metadata = metadata or {}
        self._server: Optional[grpc.Server] = None
        self._port: Optional[int] = None
        
    @abstractmethod
    async def analyze(self, task: str, data: Optional[Any] = None) -> AnalyzeResult:
        """Analyze a task and return result with confidence.
        
        Args:
            task: Description of the task to perform
            data: Optional data for the analysis
            
        Returns:
            Tuple of (result, confidence) where confidence is 0.0 to 1.0
        """
        pass
    
    async def check_health(self) -> HealthStatus:
        """Check agent health. Override for custom health checks.
        
        Returns:
            HealthStatus indicating agent health
        """
        return HealthStatus(
            status='healthy',
            message='Agent is operational',
            last_check=datetime.utcnow().isoformat()
        )
    
    def get_capabilities(self) -> Capabilities:
        """Get agent capabilities information.
        
        Returns:
            Capabilities object with agent information
        """
        return Capabilities(
            agent_id=self.id,
            name=self.name,
            capabilities=self.capabilities,
            expertise_level=self.metadata.get('expertise', 0.5),
            capability_scores=self.metadata.get('capability_scores')
        )
    
    async def serve(self, port: int = 0, max_workers: int = 10) -> int:
        """Start the gRPC server.
        
        Args:
            port: Port to listen on (0 for auto-assign)
            max_workers: Maximum number of worker threads
            
        Returns:
            Actual port the server is listening on
        """
        if not confidence_pb2_grpc:
            raise ImportError(
                "Proto files not generated. Run generate_proto.sh first."
            )
        
        self._server = grpc.aio.server(
            futures.ThreadPoolExecutor(max_workers=max_workers)
        )
        
        # Add service to server
        service = _AgentService(self)
        confidence_pb2_grpc.add_ConfidenceAgentServicer_to_server(
            service, self._server
        )
        
        # Listen on port
        listen_addr = f'[::]:{port}'
        self._port = self._server.add_insecure_port(listen_addr)
        
        # Start server
        await self._server.start()
        
        logger.info(
            f"Agent {self.name} ({self.id}) listening on port {self._port}"
        )
        
        # Register with platform if configured
        await self._register_with_platform()
        
        return self._port
    
    async def shutdown(self, grace_period: float = 5.0):
        """Gracefully shutdown the agent.
        
        Args:
            grace_period: Seconds to wait for pending RPCs
        """
        # Cancel lease renewal
        if self._renewal_task:
            self._renewal_task.cancel()
            try:
                await self._renewal_task
            except asyncio.CancelledError:
                pass
        
        # Unregister from control plane
        if self._registry_stub and self.id:
            try:
                request = registry_pb2.UnregisterRequest(agent_id=self.id)
                await self._registry_stub.unregister(request)
                logger.info(f"Agent {self.id} unregistered from control plane")
            except Exception as e:
                logger.error(f"Failed to unregister: {e}")
        
        # Stop gRPC server
        if self._server:
            await self._server.stop(grace_period)
            logger.info(f"Agent {self.name} shut down gracefully")
    
    async def wait_for_termination(self):
        """Wait for the server to terminate."""
        if self._server:
            await self._server.wait_for_termination()
    
    async def _renew_lease_loop(self):
        """Periodically renew the agent's lease."""
        while self._lease_id:
            try:
                # Wait 30 seconds between renewals
                await asyncio.sleep(30)
                
                # Renew lease
                request = registry_pb2.RenewRequest(lease_id=self._lease_id)
                response = await self._registry_stub.renew(request)
                
                if response.success:
                    logger.debug(f"Lease renewed for agent {self.id}")
                else:
                    logger.warning(f"Failed to renew lease for agent {self.id}")
                    # Try to re-register
                    await self._register_with_platform()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error renewing lease: {e}")
                await asyncio.sleep(5)  # Retry after 5 seconds
    
    async def _register_with_platform(self):
        """Register this agent with the Parallax platform."""
        if not registry_pb2_grpc:
            logger.warning("Registry proto not available, skipping registration")
            return
            
        registry_endpoint = os.getenv('PARALLAX_REGISTRY', 'localhost:50051')
        
        try:
            # Create gRPC channel to registry
            channel = grpc.aio.insecure_channel(registry_endpoint)
            self._registry_stub = registry_pb2_grpc.RegistryStub(channel)
            
            # Create registration request
            agent_reg = registry_pb2.AgentRegistration(
                id=self.id,
                name=self.name,
                endpoint=f"localhost:{self._port}",
                capabilities=self.capabilities,
                metadata=registry_pb2.AgentRegistration.Metadata(
                    labels={k: str(v) for k, v in (self.metadata or {}).items()}
                )
            )
            
            request = registry_pb2.RegisterRequest(agent=agent_reg)
            
            # Register agent
            response = await self._registry_stub.register(request)
            if response.success:
                self._lease_id = response.lease_id
                logger.info(
                    f"Agent {self.id} registered with control plane, lease_id: {self._lease_id}"
                )
                
                # Start lease renewal
                self._renewal_task = asyncio.create_task(self._renew_lease_loop())
            else:
                logger.warning(f"Failed to register agent: {response.message}")
                
        except Exception as e:
            logger.error(f"Failed to register with platform: {e}")
            # Continue running even if registration fails


if confidence_pb2_grpc is not None:
    class _AgentService(confidence_pb2_grpc.ConfidenceAgentServicer):
        """gRPC service implementation."""
        
        def __init__(self, agent: ParallaxAgent):
            self.agent = agent
        
        async def Analyze(self, request, context):
            """Handle analysis requests."""
            try:
                # Extract task and data
                task = request.task_description
                data = None
                
                if request.HasField('data'):
                    # Convert protobuf Struct to dict
                    data = self._struct_to_dict(request.data)
                
                # Call agent's analyze method
                result, confidence = await self.agent.analyze(task, data)
                
                # Build response
                response = confidence_pb2.ConfidenceResult()
                response.value_json = json.dumps(result)
                response.confidence = confidence
                response.agent_id = self.agent.id
                response.timestamp = datetime.utcnow().isoformat()
                
                # Add optional fields
                if isinstance(result, dict):
                    if 'reasoning' in result:
                        response.reasoning = str(result['reasoning'])
                    if 'uncertainties' in result:
                        response.uncertainties.extend(
                            str(u) for u in result['uncertainties']
                        )
                
                return response
                
            except Exception as e:
                logger.error(f"Error in Analyze: {e}", exc_info=True)
                context.abort(grpc.StatusCode.INTERNAL, str(e))
    
        async def GetCapabilities(self, request, context):
            """Handle capabilities requests."""
            try:
                caps = self.agent.get_capabilities()
                
                response = confidence_pb2.Capabilities()
                response.agent_id = caps.agent_id
                response.name = caps.name
                response.capabilities.extend(caps.capabilities)
                response.expertise_level = caps.expertise_level
                
                if caps.capability_scores:
                    for cap, score in caps.capability_scores.items():
                        response.capability_scores[cap] = score
                
                return response
                
            except Exception as e:
                logger.error(f"Error in GetCapabilities: {e}", exc_info=True)
                context.abort(grpc.StatusCode.INTERNAL, str(e))
    
        async def HealthCheck(self, request, context):
            """Handle health check requests."""
            try:
                health = await self.agent.check_health()
                
                response = confidence_pb2.Health()
                
                # Map status string to enum
                status_map = {
                    'healthy': confidence_pb2.Health.HEALTHY,
                    'unhealthy': confidence_pb2.Health.UNHEALTHY,
                    'degraded': confidence_pb2.Health.DEGRADED,
                }
                response.status = status_map.get(
                    health.status,
                    confidence_pb2.Health.UNHEALTHY
                )
                
                if health.message:
                    response.message = health.message
                if health.last_check:
                    response.last_check = health.last_check
                
                return response
                
            except Exception as e:
                logger.error(f"Error in HealthCheck: {e}", exc_info=True)
                context.abort(grpc.StatusCode.INTERNAL, str(e))
        
        async def StreamAnalyze(self, request, context):
            """Handle streaming analysis requests."""
            try:
                # For now, just call analyze once and yield the result
                result = await self.Analyze(request, context)
                yield result
            except Exception as e:
                logger.error(f"Error in StreamAnalyze: {e}", exc_info=True)
                context.abort(grpc.StatusCode.INTERNAL, str(e))
        
        def _struct_to_dict(self, struct):
            """Convert protobuf Struct to Python dict."""
            # Simple conversion - may need enhancement
            return json.loads(
                json.dumps(dict(struct.fields))
            )