"""Tests for ExecutionClient."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestExecutionClient:
    """Tests for the ExecutionClient class."""

    @pytest.mark.asyncio
    async def test_get_execution(self):
        """get() should call GetExecution and return a dict."""
        with patch("parallax.execution_client.executions_pb2_grpc") as mock_grpc, \
             patch("parallax.execution_client.executions_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel"):
            mock_pb2.GetExecutionRequest = MagicMock()
            mock_response = MagicMock()
            mock_stub = MagicMock()
            mock_stub.GetExecution = AsyncMock(return_value=mock_response)
            mock_grpc.ExecutionServiceStub.return_value = mock_stub

            from parallax.execution_client import ExecutionClient

            client = ExecutionClient("localhost:50051")
            with patch(
                "parallax.execution_client.MessageToDict",
                return_value={
                    "id": "exec-1",
                    "status": "COMPLETED",
                    "confidence": 0.92,
                },
            ):
                result = await client.get("exec-1")

            assert result["id"] == "exec-1"
            assert result["status"] == "COMPLETED"
            mock_stub.GetExecution.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_executions(self):
        """list() should call ListExecutions and return results."""
        with patch("parallax.execution_client.executions_pb2_grpc") as mock_grpc, \
             patch("parallax.execution_client.executions_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel"):
            mock_pb2.ListExecutionsRequest = MagicMock()
            mock_exec = MagicMock()
            mock_response = MagicMock()
            mock_response.executions = [mock_exec]
            mock_response.total = 1
            mock_stub = MagicMock()
            mock_stub.ListExecutions = AsyncMock(return_value=mock_response)
            mock_grpc.ExecutionServiceStub.return_value = mock_stub

            from parallax.execution_client import ExecutionClient

            client = ExecutionClient("localhost:50051")
            with patch(
                "parallax.execution_client.MessageToDict",
                return_value={"id": "exec-1"},
            ):
                result = await client.list(limit=10, offset=0, status="RUNNING")

            assert result["total"] == 1
            assert len(result["executions"]) == 1
            assert result["executions"][0]["id"] == "exec-1"
            mock_stub.ListExecutions.assert_called_once()

    @pytest.mark.asyncio
    async def test_stream_events(self):
        """stream_events() should yield events as dicts."""
        with patch("parallax.execution_client.executions_pb2_grpc") as mock_grpc, \
             patch("parallax.execution_client.executions_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel"):
            mock_pb2.StreamExecutionRequest = MagicMock()

            mock_event = MagicMock()

            async def _async_iter():
                yield mock_event

            mock_stub = MagicMock()
            mock_stub.StreamExecution = MagicMock(
                return_value=_async_iter()
            )
            mock_grpc.ExecutionServiceStub.return_value = mock_stub

            from parallax.execution_client import ExecutionClient

            client = ExecutionClient("localhost:50051")
            events = []
            with patch(
                "parallax.execution_client.MessageToDict",
                return_value={
                    "eventType": "status_change",
                    "execution": {"id": "exec-1"},
                },
            ):
                async for event in client.stream_events("exec-1"):
                    events.append(event)

            assert len(events) == 1
            assert events[0]["eventType"] == "status_change"

    @pytest.mark.asyncio
    async def test_close(self):
        """close() should close the gRPC channel."""
        with patch("parallax.execution_client.executions_pb2_grpc") as mock_grpc, \
             patch("parallax.execution_client.executions_pb2"), \
             patch("grpc.aio.insecure_channel") as mock_channel_fn:
            mock_channel = MagicMock()
            mock_channel.close = AsyncMock()
            mock_channel_fn.return_value = mock_channel
            mock_grpc.ExecutionServiceStub.return_value = MagicMock()

            from parallax.execution_client import ExecutionClient

            client = ExecutionClient("localhost:50051")
            await client.close()

            mock_channel.close.assert_called_once()
