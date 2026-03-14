"""Tests for gateway connection functionality."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from parallax import ParallaxAgent
from parallax.types import GatewayOptions


class GatewayTestAgent(ParallaxAgent):
    """Test agent for gateway tests."""

    def __init__(self):
        super().__init__(
            "gw-agent-1",
            "Gateway Test Agent",
            ["test", "analysis"],
            {"expertise": "0.9"},
        )

    async def analyze(self, task, data=None):
        return {"result": task}, 0.85


def _make_ack(accepted=True, message="ok", node_id="node-1"):
    """Build a mock ServerAck ControlPlaneToAgent message."""
    msg = MagicMock()
    msg.HasField = lambda f: f == "ack"
    msg.ack.accepted = accepted
    msg.ack.message = message
    msg.ack.assigned_node_id = node_id
    return msg


def _make_task_request(task_id="t1", description="do stuff"):
    """Build a mock TaskRequest ControlPlaneToAgent message."""
    msg = MagicMock()
    msg.HasField = lambda f: f == "task_request"
    msg.request_id = "req-1"
    msg.task_request.task_id = task_id
    msg.task_request.task_description = description
    msg.task_request.HasField = lambda f: False
    return msg


def _make_ping():
    """Build a mock Ping ControlPlaneToAgent message."""
    msg = MagicMock()
    msg.HasField = lambda f: f == "ping"
    return msg


def _make_async_channel():
    """Create a mock async channel whose close() is awaitable."""
    channel = MagicMock()
    channel.close = AsyncMock()
    return channel


class _AsyncStreamFromList:
    """Async iterator that yields items then stops."""

    def __init__(self, items):
        self._items = list(items)
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index < len(self._items):
            item = self._items[self._index]
            self._index += 1
            return item
        raise StopAsyncIteration


class TestGatewayConnection:
    """Tests for connect_via_gateway."""

    @pytest.fixture
    def agent(self):
        return GatewayTestAgent()

    @pytest.mark.asyncio
    async def test_connect_sends_hello_and_processes_ack(self, agent):
        """Connecting via gateway should send AgentHello and wait for ack."""
        ack = _make_ack()
        # Stream yields ack, then ends (listener will finish quickly)
        stream = _AsyncStreamFromList([ack])

        mock_stub_cls = MagicMock()
        mock_stub_cls.return_value.Connect = MagicMock(return_value=stream)

        mock_channel = _make_async_channel()

        with patch("parallax.agent.gateway_pb2_grpc") as mock_grpc, \
             patch("parallax.agent.gateway_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel", return_value=mock_channel):
            mock_grpc.AgentGatewayStub = mock_stub_cls
            mock_pb2.AgentToControlPlane = MagicMock()
            mock_pb2.AgentHello = MagicMock()
            mock_pb2.AgentHeartbeat = MagicMock()

            await agent.connect_via_gateway(
                "localhost:8081",
                GatewayOptions(auto_reconnect=False),
            )

            assert agent._gateway_connected is True
            assert agent._gateway_heartbeat_task is not None
            # Hello message was constructed
            mock_pb2.AgentToControlPlane.assert_called()

            await agent._cleanup_gateway()

    @pytest.mark.asyncio
    async def test_connect_rejected_raises(self, agent):
        """Gateway rejection should raise ConnectionError."""
        ack = _make_ack(accepted=False, message="unauthorized")
        stream = _AsyncStreamFromList([ack])

        mock_stub_cls = MagicMock()
        mock_stub_cls.return_value.Connect = MagicMock(return_value=stream)

        mock_channel = _make_async_channel()

        with patch("parallax.agent.gateway_pb2_grpc") as mock_grpc, \
             patch("parallax.agent.gateway_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel", return_value=mock_channel):
            mock_grpc.AgentGatewayStub = mock_stub_cls
            mock_pb2.AgentToControlPlane = MagicMock()
            mock_pb2.AgentHello = MagicMock()

            with pytest.raises(ConnectionError, match="unauthorized"):
                await agent.connect_via_gateway("localhost:8081")

    @pytest.mark.asyncio
    async def test_task_request_triggers_analyze(self, agent):
        """Receiving a TaskRequest should call analyze and send result."""
        ack = _make_ack()
        task = _make_task_request(task_id="t42", description="hello")

        stream = _AsyncStreamFromList([ack, task])

        mock_stub_cls = MagicMock()
        mock_stub_cls.return_value.Connect = MagicMock(return_value=stream)

        mock_channel = _make_async_channel()

        with patch("parallax.agent.gateway_pb2_grpc") as mock_grpc, \
             patch("parallax.agent.gateway_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel", return_value=mock_channel):
            mock_grpc.AgentGatewayStub = mock_stub_cls
            mock_pb2.AgentToControlPlane = MagicMock()
            mock_pb2.AgentHello = MagicMock()
            mock_pb2.AgentHeartbeat = MagicMock()
            mock_pb2.TaskResult = MagicMock()
            mock_pb2.TaskError = MagicMock()

            await agent.connect_via_gateway(
                "localhost:8081",
                GatewayOptions(auto_reconnect=False),
            )

            # Give the listener task time to process the task_request
            await asyncio.sleep(0.15)

            # hello + task_result
            assert mock_pb2.AgentToControlPlane.call_count >= 2

            await agent._cleanup_gateway()

    @pytest.mark.asyncio
    async def test_ping_triggers_heartbeat_response(self, agent):
        """Receiving a Ping should send a heartbeat back."""
        ack = _make_ack()
        ping = _make_ping()

        stream = _AsyncStreamFromList([ack, ping])

        mock_stub_cls = MagicMock()
        mock_stub_cls.return_value.Connect = MagicMock(return_value=stream)

        mock_channel = _make_async_channel()

        with patch("parallax.agent.gateway_pb2_grpc") as mock_grpc, \
             patch("parallax.agent.gateway_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel", return_value=mock_channel):
            mock_grpc.AgentGatewayStub = mock_stub_cls
            mock_pb2.AgentToControlPlane = MagicMock()
            mock_pb2.AgentHello = MagicMock()
            mock_pb2.AgentHeartbeat = MagicMock()

            await agent.connect_via_gateway(
                "localhost:8081",
                GatewayOptions(auto_reconnect=False),
            )

            await asyncio.sleep(0.15)

            # hello + heartbeat-response-to-ping
            assert mock_pb2.AgentToControlPlane.call_count >= 2

            await agent._cleanup_gateway()

    @pytest.mark.asyncio
    async def test_shutdown_cleans_up_gateway(self, agent):
        """shutdown() should clean up gateway resources."""
        ack = _make_ack()
        stream = _AsyncStreamFromList([ack])

        mock_stub_cls = MagicMock()
        mock_stub_cls.return_value.Connect = MagicMock(return_value=stream)

        mock_channel = _make_async_channel()

        with patch("parallax.agent.gateway_pb2_grpc") as mock_grpc, \
             patch("parallax.agent.gateway_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel", return_value=mock_channel):
            mock_grpc.AgentGatewayStub = mock_stub_cls
            mock_pb2.AgentToControlPlane = MagicMock()
            mock_pb2.AgentHello = MagicMock()
            mock_pb2.AgentHeartbeat = MagicMock()

            await agent.connect_via_gateway(
                "localhost:8081",
                GatewayOptions(auto_reconnect=False),
            )
            assert agent._gateway_connected is True

            await agent.shutdown()
            assert agent._gateway_connected is False
            assert agent._gateway_channel is None


class TestGatewayOptions:
    """Tests for GatewayOptions dataclass."""

    def test_defaults(self):
        opts = GatewayOptions()
        assert opts.credentials is None
        assert opts.heartbeat_interval_ms == 10000
        assert opts.auto_reconnect is True
        assert opts.max_reconnect_attempts is None
        assert opts.initial_reconnect_delay_ms == 1000
        assert opts.max_reconnect_delay_ms == 30000

    def test_custom_values(self):
        opts = GatewayOptions(
            heartbeat_interval_ms=5000,
            auto_reconnect=False,
            max_reconnect_attempts=3,
            initial_reconnect_delay_ms=500,
            max_reconnect_delay_ms=10000,
        )
        assert opts.heartbeat_interval_ms == 5000
        assert opts.auto_reconnect is False
        assert opts.max_reconnect_attempts == 3
