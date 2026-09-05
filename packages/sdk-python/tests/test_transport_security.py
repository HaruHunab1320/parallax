"""Service-key plumbing and fail-closed transport configuration."""

import grpc
import pytest
from unittest.mock import AsyncMock, Mock, patch

from parallax.transport_security import control_plane_channel, control_plane_metadata


def test_metadata_preserves_caller_and_explicit_key(monkeypatch):
    monkeypatch.setenv("PARALLAX_GRPC_API_KEY", "environment-key")
    caller = [("trace-id", "trace")]
    assert control_plane_metadata(caller) == (("trace-id", "trace"), ("x-parallax-api-key", "environment-key"))
    assert caller == [("trace-id", "trace")]
    assert control_plane_metadata([("x-parallax-api-key", "explicit")]) == (("x-parallax-api-key", "explicit"),)


def test_invalid_tls_never_creates_insecure_channel(monkeypatch, tmp_path):
    ca = tmp_path / "invalid.pem"
    ca.write_text("not a certificate")
    monkeypatch.setenv("PARALLAX_GRPC_TLS_ENABLED", "true")
    monkeypatch.setenv("PARALLAX_GRPC_CLIENT_TLS_CA", str(ca))
    with patch("grpc.aio.insecure_channel") as insecure:
        with pytest.raises(Exception):
            control_plane_channel("127.0.0.1:1")
        insecure.assert_not_called()


@pytest.mark.asyncio
async def test_execution_unary_and_stream_send_metadata(monkeypatch):
    from parallax.execution_client import ExecutionClient, executions_pb2, executions_pb2_grpc

    key = "trusted-test-service-key"
    monkeypatch.setenv("PARALLAX_GRPC_API_KEY", key)
    seen = []

    class Service(executions_pb2_grpc.ExecutionServiceServicer):
        async def GetExecution(self, request, context):
            if dict(context.invocation_metadata()).get("x-parallax-api-key") != key:
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, "key required")
            seen.append("get")
            return executions_pb2.GetExecutionResponse(execution=executions_pb2.Execution(id=request.execution_id))

        async def StreamExecution(self, request, context):
            if dict(context.invocation_metadata()).get("x-parallax-api-key") != key:
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, "key required")
            seen.append("stream")
            yield executions_pb2.StreamExecutionResponse(event_type="completed")

    server = grpc.aio.server()
    executions_pb2_grpc.add_ExecutionServiceServicer_to_server(Service(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    client = ExecutionClient(f"127.0.0.1:{port}")
    denied = ExecutionClient(f"127.0.0.1:{port}", api_key="wrong")
    try:
        assert (await client.get("execution"))["id"] == "execution"
        assert [event["eventType"] async for event in client.stream_events("execution")] == ["completed"]
        with pytest.raises(grpc.aio.AioRpcError) as error:
            await denied.get("execution")
        assert error.value.code() == grpc.StatusCode.UNAUTHENTICATED
        assert seen == ["get", "stream"]
    finally:
        await client.close()
        await denied.close()
        await server.stop(0)


@pytest.mark.asyncio
async def test_agent_registry_lifecycle_authentication_and_rejection(monkeypatch):
    from parallax.agent import ParallaxAgent, registry_pb2, registry_pb2_grpc

    key = "trusted-registry-service-key"
    monkeypatch.setenv("PARALLAX_GRPC_API_KEY", key)
    seen = []

    class Agent(ParallaxAgent):
        async def analyze(self, task, data=None):
            return {}, 1.0

    class Registry(registry_pb2_grpc.RegistryServicer):
        async def Register(self, request, context):
            if dict(context.invocation_metadata()).get("x-parallax-api-key") != key:
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, "key required")
            seen.append(("register", request.agent.id))
            return registry_pb2.RegisterResponse(success=True, lease_id="lease")

        async def Unregister(self, request, context):
            if dict(context.invocation_metadata()).get("x-parallax-api-key") != key:
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, "key required")
            seen.append(("unregister", request.id))
            return registry_pb2.RegisterResponse(success=True)

    server = grpc.aio.server()
    registry_pb2_grpc.add_RegistryServicer_to_server(Registry(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    monkeypatch.setenv("PARALLAX_REGISTRY", f"127.0.0.1:{port}")
    agent = Agent("agent-registry", "Registry Agent", [])
    agent._port = 12345
    try:
        await agent._register_with_platform()
        renewal = agent._renewal_task
        await agent._register_with_platform()
        assert agent._renewal_task is renewal
        await agent.shutdown()
        assert seen == [("register", agent.id), ("register", agent.id), ("unregister", agent.id)]
        assert agent._registry_channel is None

        monkeypatch.setenv("PARALLAX_GRPC_API_KEY", "incorrect")
        denied = Agent("denied", "Denied Agent", [])
        listener = Mock()
        listener.start = AsyncMock()
        listener.stop = AsyncMock()
        listener.add_insecure_port.return_value = 12346
        with patch("parallax.agent.grpc.aio.server", return_value=listener):
            with pytest.raises(grpc.aio.AioRpcError) as error:
                await denied.serve()
        assert error.value.code() == grpc.StatusCode.UNAUTHENTICATED
        listener.stop.assert_awaited_once_with(0)
        assert denied._registry_channel is None
        assert denied._renewal_task is None
    finally:
        monkeypatch.setenv("PARALLAX_GRPC_API_KEY", key)
        await agent.shutdown()
        await server.stop(0)
