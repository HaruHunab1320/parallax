"""Execution client for interacting with the Parallax ExecutionService."""

import logging
from typing import Any, AsyncIterator, Dict, List, Optional

import grpc

from .transport_security import control_plane_channel, control_plane_metadata, Metadata

try:
    import sys
    from pathlib import Path

    generated_path = Path(__file__).parent.parent.parent / "generated"
    sys.path.insert(0, str(generated_path))
    import executions_pb2
    import executions_pb2_grpc
    from google.protobuf.json_format import MessageToDict
except ImportError:
    executions_pb2 = None
    executions_pb2_grpc = None

logger = logging.getLogger(__name__)


class ExecutionClient:
    """Client for the Parallax ExecutionService.

    Provides methods to get, list, and stream execution events from the
    control plane.

    Args:
        endpoint: gRPC endpoint of the control plane (e.g. ``"localhost:50051"``).
        credentials: Optional gRPC channel credentials. When absent, client TLS
            environment settings select a secure or local insecure channel.
    """

    def __init__(
        self,
        endpoint: str,
        credentials: Optional[grpc.ChannelCredentials] = None,
        *,
        api_key: Optional[str] = None,
        metadata: Optional[Metadata] = None,
    ):
        if not executions_pb2_grpc:
            raise ImportError(
                "Execution proto files not generated. "
                "Run generate-proto.sh first."
            )

        self._channel = control_plane_channel(endpoint, credentials)
        self._metadata = control_plane_metadata(metadata, api_key)

        self._stub = executions_pb2_grpc.ExecutionServiceStub(self._channel)

    async def get(self, execution_id: str) -> Dict[str, Any]:
        """Get execution status by ID.

        Args:
            execution_id: The execution identifier.

        Returns:
            Execution record as a dictionary.
        """
        request = executions_pb2.GetExecutionRequest(
            execution_id=execution_id,
        )
        response = await self._stub.GetExecution(request, metadata=self._metadata)
        return MessageToDict(response.execution)

    async def list(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List executions.

        Args:
            limit: Maximum number of results to return.
            offset: Number of results to skip.
            status: Optional status filter (e.g. ``"RUNNING"``,
                ``"COMPLETED"``).

        Returns:
            Dictionary with ``executions`` list and ``total`` count.
        """
        request = executions_pb2.ListExecutionsRequest(
            limit=limit,
            offset=offset,
            status=status or "",
        )
        response = await self._stub.ListExecutions(request, metadata=self._metadata)
        return {
            "executions": [
                MessageToDict(e) for e in response.executions
            ],
            "total": response.total,
        }

    async def stream_events(
        self, execution_id: str
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream execution events as an async iterator.

        Args:
            execution_id: The execution identifier to stream events for.

        Yields:
            Event dictionaries containing ``event_type``, ``execution``,
            ``event_time``, and ``event_data``.
        """
        request = executions_pb2.StreamExecutionRequest(
            execution_id=execution_id,
        )
        stream = self._stub.StreamExecution(request, metadata=self._metadata)
        async for event in stream:
            yield MessageToDict(event)

    async def close(self) -> None:
        """Close the underlying gRPC channel."""
        if self._channel:
            await self._channel.close()
