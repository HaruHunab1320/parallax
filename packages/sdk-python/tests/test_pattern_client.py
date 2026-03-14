"""Tests for PatternClient."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestPatternClient:
    """Tests for the PatternClient class."""

    @pytest.mark.asyncio
    async def test_list_patterns(self):
        """list() should call ListPatterns and return dicts."""
        with patch("parallax.pattern_client.patterns_pb2_grpc") as mock_grpc, \
             patch("parallax.pattern_client.patterns_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel"):
            # Setup
            mock_pb2.ListPatternsRequest = MagicMock()
            mock_pattern = MagicMock()
            mock_response = MagicMock()
            mock_response.patterns = [mock_pattern]
            mock_stub = MagicMock()
            mock_stub.ListPatterns = AsyncMock(return_value=mock_response)
            mock_grpc.PatternServiceStub.return_value = mock_stub

            from parallax.pattern_client import PatternClient

            client = PatternClient("localhost:50051")
            with patch(
                "parallax.pattern_client.MessageToDict",
                return_value={"name": "test-pattern"},
            ):
                result = await client.list()

            assert len(result) == 1
            assert result[0]["name"] == "test-pattern"
            mock_stub.ListPatterns.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_pattern(self):
        """get() should call GetPattern and return a dict."""
        with patch("parallax.pattern_client.patterns_pb2_grpc") as mock_grpc, \
             patch("parallax.pattern_client.patterns_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel"):
            mock_pb2.GetPatternRequest = MagicMock()
            mock_response = MagicMock()
            mock_stub = MagicMock()
            mock_stub.GetPattern = AsyncMock(return_value=mock_response)
            mock_grpc.PatternServiceStub.return_value = mock_stub

            from parallax.pattern_client import PatternClient

            client = PatternClient("localhost:50051")
            with patch(
                "parallax.pattern_client.MessageToDict",
                return_value={"name": "my-pattern", "version": "1.0"},
            ):
                result = await client.get("my-pattern")

            assert result["name"] == "my-pattern"
            mock_stub.GetPattern.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_pattern(self):
        """execute() should call ExecutePattern with input and options."""
        with patch("parallax.pattern_client.patterns_pb2_grpc") as mock_grpc, \
             patch("parallax.pattern_client.patterns_pb2") as mock_pb2, \
             patch("parallax.pattern_client.struct_pb2") as mock_struct, \
             patch("parallax.pattern_client.ParseDict") as mock_parse, \
             patch("grpc.aio.insecure_channel"):
            mock_pb2.ExecutePatternRequest = MagicMock()
            mock_pb2.ExecutePatternRequest.Options = MagicMock()
            mock_response = MagicMock()
            mock_stub = MagicMock()
            mock_stub.ExecutePattern = AsyncMock(return_value=mock_response)
            mock_grpc.PatternServiceStub.return_value = mock_stub

            from parallax.pattern_client import PatternClient

            client = PatternClient("localhost:50051")
            with patch(
                "parallax.pattern_client.MessageToDict",
                return_value={
                    "executionId": "exec-1",
                    "status": "SUCCESS",
                },
            ):
                result = await client.execute(
                    "my-pattern",
                    input_data={"key": "value"},
                    options={"timeout_ms": 5000},
                )

            assert result["executionId"] == "exec-1"
            mock_stub.ExecutePattern.assert_called_once()

    @pytest.mark.asyncio
    async def test_upload_pattern(self):
        """upload() should call UploadPattern and return status."""
        with patch("parallax.pattern_client.patterns_pb2_grpc") as mock_grpc, \
             patch("parallax.pattern_client.patterns_pb2") as mock_pb2, \
             patch("grpc.aio.insecure_channel"):
            mock_pb2.Pattern = MagicMock()
            mock_pb2.Pattern.Requirements = MagicMock()
            mock_pb2.UploadPatternRequest = MagicMock()
            mock_response = MagicMock()
            mock_response.success = True
            mock_response.message = "uploaded"
            mock_response.pattern_id = "p-123"
            mock_stub = MagicMock()
            mock_stub.UploadPattern = AsyncMock(return_value=mock_response)
            mock_grpc.PatternServiceStub.return_value = mock_stub

            from parallax.pattern_client import PatternClient

            client = PatternClient("localhost:50051")
            result = await client.upload(
                {
                    "name": "new-pattern",
                    "version": "1.0",
                    "description": "A test pattern",
                    "prism_script": "parallel { agent1, agent2 }",
                },
                overwrite=True,
            )

            assert result["success"] is True
            assert result["pattern_id"] == "p-123"
            mock_stub.UploadPattern.assert_called_once()

    @pytest.mark.asyncio
    async def test_close(self):
        """close() should close the gRPC channel."""
        with patch("parallax.pattern_client.patterns_pb2_grpc") as mock_grpc, \
             patch("parallax.pattern_client.patterns_pb2"), \
             patch("grpc.aio.insecure_channel") as mock_channel_fn:
            mock_channel = MagicMock()
            mock_channel.close = AsyncMock()
            mock_channel_fn.return_value = mock_channel
            mock_grpc.PatternServiceStub.return_value = MagicMock()

            from parallax.pattern_client import PatternClient

            client = PatternClient("localhost:50051")
            await client.close()

            mock_channel.close.assert_called_once()
