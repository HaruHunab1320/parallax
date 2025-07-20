"""gRPC-enabled Parallax agent implementation."""

import asyncio
import grpc
import json
import logging
import os
import sys
from concurrent import futures
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add generated directory to Python path
generated_path = Path(__file__).parent.parent.parent / "generated"
sys.path.insert(0, str(generated_path))

# Import generated protobuf files
import confidence_pb2
import confidence_pb2_grpc
import registry_pb2
import registry_pb2_grpc
from google.protobuf import empty_pb2, struct_pb2, timestamp_pb2

from .agent import ParallaxAgent
from .types import AnalyzeResult, HealthStatus

logger = logging.getLogger(__name__)


class GrpcParallaxAgent(ParallaxAgent):
    """gRPC-enabled Parallax agent that implements ConfidenceAgent service."""
    
    def __init__(
        self,
        agent_id: str,
        name: str,
        capabilities: List[str],
        metadata: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(agent_id, name, capabilities, metadata)
        self._server: Optional[grpc.aio.Server] = None
        self._registry_stub: Optional[registry_pb2_grpc.RegistryStub] = None
        self._lease_id: Optional[str] = None
        self._renewal_task: Optional[asyncio.Task] = None
        self._port: int = 0
        
    async def serve(self, port: int = 0, max_workers: int = 10) -> int:
        """Start the gRPC server and register with control plane.
        
        Args:
            port: Port to listen on (0 for auto-assign)
            max_workers: Maximum number of worker threads
            
        Returns:
            Actual port the server is listening on
        """
        # Create gRPC server
        self._server = grpc.aio.server(
            futures.ThreadPoolExecutor(max_workers=max_workers)
        )
        
        # Add ConfidenceAgent service
        servicer = _ConfidenceAgentServicer(self)
        confidence_pb2_grpc.add_ConfidenceAgentServicer_to_server(
            servicer, self._server
        )
        
        # Listen on port
        listen_addr = f'[::]:{port}'
        self._port = self._server.add_insecure_port(listen_addr)
        
        # Start server
        await self._server.start()
        
        logger.info(
            f"Agent {self.name} ({self.id}) listening on port {self._port}"
        )
        
        # Register with control plane
        try:
            await self._register_with_platform()
        except Exception as e:
            logger.error(f"Failed to register with control plane: {e}")
            # Continue running even if registration fails
        
        return self._port
    
    async def _register_with_platform(self):
        """Register this agent with the Parallax platform."""
        registry_endpoint = os.getenv('PARALLAX_REGISTRY', 'localhost:50051')
        
        # Create gRPC channel to registry
        channel = grpc.aio.insecure_channel(registry_endpoint)
        self._registry_stub = registry_pb2_grpc.RegistryStub(channel)
        
        # Create registration request
        agent = registry_pb2.Agent(
            id=self.id,
            name=self.name,
            address=f"localhost:{self._port}",
            capabilities=self.capabilities,
            metadata={k: str(v) for k, v in (self.metadata or {}).items()},
            status=registry_pb2.Agent.HEALTHY
        )
        
        request = registry_pb2.RegisterRequest(agent=agent)
        
        # Register agent
        response = await self._registry_stub.register(request)
        self._lease_id = response.registration.lease_id
        
        logger.info(
            f"Agent {self.id} registered with control plane, lease_id: {self._lease_id}"
        )
        
        # Start lease renewal
        self._renewal_task = asyncio.create_task(self._renew_lease_loop())
    
    async def _renew_lease_loop(self):
        """Periodically renew the agent's lease."""
        while self._lease_id:
            try:
                # Wait 30 seconds between renewals
                await asyncio.sleep(30)
                
                # Renew lease
                request = registry_pb2.RenewRequest(lease_id=self._lease_id)
                response = await self._registry_stub.renew(request)
                
                if response.renewed:
                    logger.debug(f"Lease renewed for agent {self.id}")
                else:
                    logger.warning(f"Failed to renew lease for agent {self.id}")
                    break
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error renewing lease: {e}")
                await asyncio.sleep(5)  # Retry after 5 seconds
    
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


class _ConfidenceAgentServicer(confidence_pb2_grpc.ConfidenceAgentServicer):
    """gRPC service implementation for ConfidenceAgent."""
    
    def __init__(self, agent: GrpcParallaxAgent):
        self.agent = agent
    
    async def execute(self, request, context):
        """Handle execute requests."""
        try:
            # Extract task
            task = request.task
            task_description = task.description if task else ""
            task_data = json.loads(task.data) if task and task.data else None
            
            # Call agent's analyze method
            result = await self.agent.analyze(task_description, task_data)
            
            # Build response
            response = confidence_pb2.ExecuteResponse()
            
            # Create ConfidenceResult
            confidence_result = response.result
            confidence_result.value_json = json.dumps(result.value)
            confidence_result.confidence = result.confidence
            confidence_result.agent_id = self.agent.id
            
            # Set timestamp
            now = datetime.utcnow()
            confidence_result.timestamp.seconds = int(now.timestamp())
            confidence_result.timestamp.nanos = now.microsecond * 1000
            
            # Add optional fields
            if result.reasoning:
                confidence_result.reasoning = result.reasoning
            
            if result.uncertainties:
                confidence_result.uncertainties.extend(result.uncertainties)
            
            if result.metadata:
                for k, v in result.metadata.items():
                    confidence_result.metadata[k] = str(v)
            
            return response
            
        except Exception as e:
            logger.error(f"Error executing task: {e}")
            await context.abort(
                grpc.StatusCode.INTERNAL,
                f"Failed to execute task: {str(e)}"
            )
    
    async def streamExecute(self, request, context):
        """Handle streaming execute requests."""
        try:
            # For now, execute once and yield result
            # TODO: Implement proper streaming
            task = request.task
            task_description = task.description if task else ""
            task_data = json.loads(task.data) if task and task.data else None
            
            result = await self.agent.analyze(task_description, task_data)
            
            # Build response
            response = confidence_pb2.ExecuteResponse()
            
            # Create ConfidenceResult
            confidence_result = response.result
            confidence_result.value_json = json.dumps(result.value)
            confidence_result.confidence = result.confidence
            confidence_result.agent_id = self.agent.id
            
            # Set timestamp
            now = datetime.utcnow()
            confidence_result.timestamp.seconds = int(now.timestamp())
            confidence_result.timestamp.nanos = now.microsecond * 1000
            
            if result.reasoning:
                confidence_result.reasoning = result.reasoning
            
            if result.uncertainties:
                confidence_result.uncertainties.extend(result.uncertainties)
            
            if result.metadata:
                for k, v in result.metadata.items():
                    confidence_result.metadata[k] = str(v)
            
            yield response
            
        except Exception as e:
            logger.error(f"Error in stream execute: {e}")
            await context.abort(
                grpc.StatusCode.INTERNAL,
                f"Failed to execute task: {str(e)}"
            )
    
    async def getCapabilities(self, request, context):
        """Handle get capabilities requests."""
        response = confidence_pb2.GetCapabilitiesResponse()
        response.capabilities.extend(self.agent.capabilities)
        response.expertise_level = confidence_pb2.GetCapabilitiesResponse.EXPERT
        
        # Add capability scores if available
        if hasattr(self.agent, 'capability_scores'):
            for cap, score in self.agent.capability_scores.items():
                response.capability_scores[cap] = score
        
        return response
    
    async def healthCheck(self, request, context):
        """Handle health check requests."""
        health = await self.agent.check_health()
        
        response = confidence_pb2.HealthCheckResponse()
        
        # Map health status
        if health.status == HealthStatus.HEALTHY:
            response.status = confidence_pb2.HealthCheckResponse.HEALTHY
        elif health.status == HealthStatus.DEGRADED:
            response.status = confidence_pb2.HealthCheckResponse.DEGRADED
        else:
            response.status = confidence_pb2.HealthCheckResponse.UNHEALTHY
        
        if health.message:
            response.message = health.message
        
        return response


async def serve_grpc_agent(agent: ParallaxAgent, port: int = 0) -> int:
    """Helper function to serve any ParallaxAgent with gRPC.
    
    Args:
        agent: The agent to serve
        port: Port to listen on (0 for auto-assign)
        
    Returns:
        Actual port the server is listening on
    """
    # Create gRPC wrapper
    grpc_agent = GrpcParallaxAgent(
        agent.id,
        agent.name,
        agent.capabilities,
        agent.metadata
    )
    
    # Override methods to use original agent's implementation
    grpc_agent.analyze = agent.analyze
    grpc_agent.check_health = agent.check_health
    
    # Start server
    return await grpc_agent.serve(port)