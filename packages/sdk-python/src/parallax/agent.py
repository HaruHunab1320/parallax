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

from .types import AnalyzeResult, Capabilities, GatewayOptions, HealthStatus

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
    import gateway_pb2
    import gateway_pb2_grpc
    from google.protobuf import empty_pb2, struct_pb2, timestamp_pb2
except ImportError:
    # Proto files not generated yet
    confidence_pb2 = None
    confidence_pb2_grpc = None
    registry_pb2 = None
    registry_pb2_grpc = None
    gateway_pb2 = None
    gateway_pb2_grpc = None

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
        # Gateway connection state
        self._gateway_stream: Optional[Any] = None
        self._gateway_channel: Optional[grpc.aio.Channel] = None
        self._gateway_heartbeat_task: Optional[asyncio.Task] = None
        self._gateway_listener_task: Optional[asyncio.Task] = None
        self._gateway_endpoint: Optional[str] = None
        self._gateway_options: Optional[GatewayOptions] = None
        self._gateway_reconnecting: bool = False
        self._gateway_connected: bool = False
        
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
            last_check=datetime.utcnow()
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
    
    async def connect_via_gateway(
        self,
        endpoint: str,
        options: Optional[GatewayOptions] = None,
    ) -> None:
        """Connect to the control plane via the Agent Gateway.

        Use this instead of ``serve()`` for agents behind NAT or without a
        public endpoint.  The agent opens an outbound connection and tasks
        are received through the bidirectional stream.

        Args:
            endpoint: Gateway gRPC endpoint (e.g. ``"localhost:8081"``).
            options: Optional :class:`GatewayOptions` for tuning the
                connection behaviour.

        Raises:
            ImportError: If the gateway proto stubs have not been generated.
            ConnectionError: If the gateway rejects the agent or the
                initial acknowledgement times out.
        """
        if not gateway_pb2_grpc:
            raise ImportError(
                "Gateway proto files not generated. "
                "Run generate-proto.sh first."
            )

        self._gateway_endpoint = endpoint
        self._gateway_options = options or GatewayOptions()
        opts = self._gateway_options

        # Create channel
        if opts.credentials:
            self._gateway_channel = grpc.aio.secure_channel(
                endpoint, opts.credentials
            )
        else:
            self._gateway_channel = grpc.aio.insecure_channel(endpoint)

        stub = gateway_pb2_grpc.AgentGatewayStub(self._gateway_channel)

        # We need an async generator to feed the stream
        self._gateway_outgoing: asyncio.Queue = asyncio.Queue()

        async def _request_iterator():
            while True:
                msg = await self._gateway_outgoing.get()
                if msg is None:
                    return
                yield msg

        # Open bidirectional stream
        self._gateway_stream = stub.Connect(_request_iterator())

        # Send AgentHello
        hello_msg = gateway_pb2.AgentToControlPlane(
            request_id=f"hello-{self.id}",
            hello=gateway_pb2.AgentHello(
                agent_id=self.id,
                agent_name=self.name,
                capabilities=self.capabilities,
                metadata={k: str(v) for k, v in self.metadata.items()},
                heartbeat_interval_ms=opts.heartbeat_interval_ms,
            ),
        )
        await self._gateway_outgoing.put(hello_msg)

        logger.info(
            f"Agent {self.name} ({self.id}) connecting via gateway to {endpoint}"
        )

        # Wait for ServerAck
        try:
            ack_msg = await asyncio.wait_for(
                self._gateway_stream.__anext__(), timeout=10.0
            )
        except asyncio.TimeoutError:
            await self._cleanup_gateway()
            raise ConnectionError(
                "Gateway connection timed out waiting for ack"
            )

        if ack_msg.HasField("ack"):
            if not ack_msg.ack.accepted:
                await self._cleanup_gateway()
                raise ConnectionError(
                    f"Gateway rejected agent: {ack_msg.ack.message}"
                )
            logger.info(
                f"Agent {self.name} connected via gateway "
                f"(node: {ack_msg.ack.assigned_node_id})"
            )
        else:
            await self._cleanup_gateway()
            raise ConnectionError(
                "Expected ServerAck as first response from gateway"
            )

        self._gateway_connected = True

        # Start heartbeat loop
        self._gateway_heartbeat_task = asyncio.create_task(
            self._gateway_heartbeat_loop()
        )

        # Start listener loop
        self._gateway_listener_task = asyncio.create_task(
            self._gateway_listen_loop()
        )

    async def _gateway_heartbeat_loop(self) -> None:
        """Periodically send heartbeat messages over the gateway stream."""
        opts = self._gateway_options or GatewayOptions()
        interval = opts.heartbeat_interval_ms / 1000.0
        while self._gateway_connected:
            try:
                await asyncio.sleep(interval)
                if not self._gateway_connected:
                    break
                heartbeat = gateway_pb2.AgentToControlPlane(
                    request_id="",
                    heartbeat=gateway_pb2.AgentHeartbeat(
                        agent_id=self.id,
                        load=0.0,
                        status="healthy",
                    ),
                )
                await self._gateway_outgoing.put(heartbeat)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
                break

    async def _gateway_listen_loop(self) -> None:
        """Listen for messages from the control plane on the gateway stream."""
        disconnected = False
        try:
            async for message in self._gateway_stream:
                if not self._gateway_connected:
                    return
                await self._handle_gateway_message(message)
            # Stream ended normally
            disconnected = True
        except asyncio.CancelledError:
            return
        except grpc.aio.AioRpcError as e:
            logger.error(f"Gateway stream error: {e}")
            disconnected = True
        except Exception as e:
            logger.error(f"Gateway listener error: {e}")
            disconnected = True
        finally:
            if disconnected and self._gateway_connected:
                self._gateway_connected = False
                await self._handle_gateway_disconnect()

    async def _handle_gateway_message(self, message) -> None:
        """Dispatch a single control-plane message."""
        if message.HasField("task_request"):
            await self._handle_gateway_task(
                message.request_id, message.task_request
            )
        elif message.HasField("cancel_task"):
            logger.info(
                f"Task cancelled: {message.cancel_task.task_id} "
                f"({message.cancel_task.reason})"
            )
        elif message.HasField("ping"):
            # Respond to ping with a heartbeat
            heartbeat = gateway_pb2.AgentToControlPlane(
                request_id="",
                heartbeat=gateway_pb2.AgentHeartbeat(
                    agent_id=self.id,
                    load=0.0,
                    status="healthy",
                ),
            )
            await self._gateway_outgoing.put(heartbeat)
        elif message.HasField("ack"):
            # Additional acks after the initial one (e.g. on reconnect)
            logger.debug(f"Received additional ack: {message.ack.message}")

    async def _handle_gateway_task(self, request_id: str, task_request) -> None:
        """Execute a task received via the gateway and send the result back."""
        try:
            task_description = task_request.task_description or ""
            data = None
            if task_request.HasField("data"):
                from google.protobuf.json_format import MessageToDict
                data = MessageToDict(task_request.data)

            result, confidence = await self.analyze(task_description, data)

            result_msg = gateway_pb2.AgentToControlPlane(
                request_id=request_id,
                task_result=gateway_pb2.TaskResult(
                    task_id=task_request.task_id,
                    value_json=json.dumps(result),
                    confidence=confidence,
                    reasoning=result.get("reasoning", "")
                    if isinstance(result, dict)
                    else "",
                ),
            )
            await self._gateway_outgoing.put(result_msg)
        except Exception as e:
            error_msg = gateway_pb2.AgentToControlPlane(
                request_id=request_id,
                task_error=gateway_pb2.TaskError(
                    task_id=task_request.task_id,
                    error_message=str(e),
                    error_code="INTERNAL",
                ),
            )
            await self._gateway_outgoing.put(error_msg)

    async def _handle_gateway_disconnect(self) -> None:
        """Handle gateway disconnection with optional auto-reconnect."""
        await self._cleanup_gateway()

        opts = self._gateway_options or GatewayOptions()
        if not opts.auto_reconnect or self._gateway_reconnecting:
            return
        if not self._gateway_endpoint:
            return

        self._gateway_reconnecting = True
        initial_delay = opts.initial_reconnect_delay_ms / 1000.0
        max_delay = opts.max_reconnect_delay_ms / 1000.0
        max_attempts = opts.max_reconnect_attempts  # None = infinite

        attempt = 0
        while max_attempts is None or attempt < max_attempts:
            delay = min(initial_delay * (2 ** attempt), max_delay)
            attempt += 1
            logger.info(
                f"Gateway reconnecting in {delay:.1f}s (attempt {attempt})..."
            )
            await asyncio.sleep(delay)

            try:
                await self.connect_via_gateway(
                    self._gateway_endpoint, self._gateway_options
                )
                logger.info("Gateway reconnected successfully")
                self._gateway_reconnecting = False
                return
            except Exception as e:
                logger.error(
                    f"Gateway reconnect attempt {attempt} failed: {e}"
                )

        logger.error(
            f"Gateway reconnect failed after {attempt} attempts"
        )
        self._gateway_reconnecting = False

    async def _cleanup_gateway(self) -> None:
        """Clean up gateway connection resources."""
        self._gateway_connected = False

        if self._gateway_heartbeat_task:
            self._gateway_heartbeat_task.cancel()
            try:
                await self._gateway_heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass
            self._gateway_heartbeat_task = None

        if self._gateway_listener_task:
            self._gateway_listener_task.cancel()
            try:
                await self._gateway_listener_task
            except (asyncio.CancelledError, Exception):
                pass
            self._gateway_listener_task = None

        # Signal the outgoing iterator to stop
        if hasattr(self, '_gateway_outgoing'):
            try:
                self._gateway_outgoing.put_nowait(None)
            except asyncio.QueueFull:
                pass

        if self._gateway_channel:
            try:
                await self._gateway_channel.close()
            except Exception:
                pass
            self._gateway_channel = None

        self._gateway_stream = None

    async def shutdown(self, grace_period: float = 5.0):
        """Gracefully shutdown the agent.

        Args:
            grace_period: Seconds to wait for pending RPCs
        """
        # Clean up gateway connection
        await self._cleanup_gateway()

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
                await self._registry_stub.Unregister(request)
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
                response = await self._registry_stub.Renew(request)
                
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
            response = await self._registry_stub.Register(request)
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
                response.timestamp.FromDatetime(datetime.utcnow())
                
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
                await context.abort(grpc.StatusCode.INTERNAL, str(e))
    
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
                await context.abort(grpc.StatusCode.INTERNAL, str(e))
    
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
                    response.last_check.FromDatetime(health.last_check)
                
                return response
                
            except Exception as e:
                logger.error(f"Error in HealthCheck: {e}", exc_info=True)
                await context.abort(grpc.StatusCode.INTERNAL, str(e))
        
        async def StreamAnalyze(self, request, context):
            """Handle streaming analysis requests."""
            try:
                # For now, just call analyze once and yield the result
                result = await self.Analyze(request, context)
                yield result
            except Exception as e:
                logger.error(f"Error in StreamAnalyze: {e}", exc_info=True)
                await context.abort(grpc.StatusCode.INTERNAL, str(e))
        
        def _struct_to_dict(self, struct):
            """Convert protobuf Struct to Python dict."""
            from google.protobuf.json_format import MessageToDict
            return MessageToDict(struct)