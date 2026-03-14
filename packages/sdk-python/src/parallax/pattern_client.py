"""Pattern client for interacting with the Parallax PatternService."""

import logging
from typing import Any, Dict, List, Optional

import grpc

try:
    import sys
    from pathlib import Path

    generated_path = Path(__file__).parent.parent.parent / "generated"
    sys.path.insert(0, str(generated_path))
    import patterns_pb2
    import patterns_pb2_grpc
    from google.protobuf import struct_pb2
    from google.protobuf.json_format import MessageToDict, ParseDict
except ImportError:
    patterns_pb2 = None
    patterns_pb2_grpc = None

logger = logging.getLogger(__name__)


class PatternClient:
    """Client for the Parallax PatternService.

    Provides methods to list, get, execute, and upload orchestration
    patterns on the control plane.

    Args:
        endpoint: gRPC endpoint of the control plane (e.g. ``"localhost:50051"``).
        credentials: Optional gRPC channel credentials. Uses an insecure
            channel when ``None``.
    """

    def __init__(
        self,
        endpoint: str,
        credentials: Optional[grpc.ChannelCredentials] = None,
    ):
        if not patterns_pb2_grpc:
            raise ImportError(
                "Pattern proto files not generated. "
                "Run generate-proto.sh first."
            )

        if credentials:
            self._channel = grpc.aio.secure_channel(endpoint, credentials)
        else:
            self._channel = grpc.aio.insecure_channel(endpoint)

        self._stub = patterns_pb2_grpc.PatternServiceStub(self._channel)

    async def list(
        self,
        tags: Optional[List[str]] = None,
        include_scripts: bool = False,
    ) -> List[Dict[str, Any]]:
        """List available patterns.

        Args:
            tags: Optional tag filter.
            include_scripts: Whether to include full Prism scripts in the
                response.

        Returns:
            A list of pattern dictionaries.
        """
        request = patterns_pb2.ListPatternsRequest(
            tags=tags or [],
            include_scripts=include_scripts,
        )
        response = await self._stub.ListPatterns(request)
        return [MessageToDict(p) for p in response.patterns]

    async def get(
        self,
        name: str,
        version: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get a pattern by name.

        Args:
            name: Pattern name.
            version: Optional version string. Uses latest when ``None``.

        Returns:
            Pattern as a dictionary.
        """
        request = patterns_pb2.GetPatternRequest(
            name=name,
            version=version or "",
        )
        response = await self._stub.GetPattern(request)
        return MessageToDict(response)

    async def execute(
        self,
        pattern_name: str,
        input_data: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute a pattern.

        Args:
            pattern_name: Name of the pattern to execute.
            input_data: Input data for the pattern execution.
            options: Execution options (``timeout_ms``, ``max_parallel``,
                ``cache_results``, ``context``).

        Returns:
            Execution response as a dictionary.
        """
        request = patterns_pb2.ExecutePatternRequest(
            pattern_name=pattern_name,
        )

        if input_data:
            input_struct = struct_pb2.Struct()
            ParseDict(input_data, input_struct)
            request.input.CopyFrom(input_struct)

        if options:
            opts = patterns_pb2.ExecutePatternRequest.Options(
                timeout_ms=options.get("timeout_ms", 0),
                max_parallel=options.get("max_parallel", 0),
                cache_results=options.get("cache_results", False),
                context=options.get("context", {}),
            )
            request.options.CopyFrom(opts)

        response = await self._stub.ExecutePattern(request)
        return MessageToDict(response)

    async def upload(
        self,
        pattern: Dict[str, Any],
        overwrite: bool = False,
    ) -> Dict[str, Any]:
        """Upload a new pattern.

        Args:
            pattern: Pattern definition with ``name``, ``description``,
                ``prism_script``, etc.
            overwrite: Whether to overwrite an existing pattern with the
                same name.

        Returns:
            Upload response with ``success``, ``message``, and
            ``pattern_id`` fields.
        """
        pattern_msg = patterns_pb2.Pattern(
            name=pattern.get("name", ""),
            version=pattern.get("version", ""),
            description=pattern.get("description", ""),
            prism_script=pattern.get("prism_script", ""),
        )

        requirements = pattern.get("requirements")
        if requirements:
            req_msg = patterns_pb2.Pattern.Requirements(
                capabilities=requirements.get("capabilities", []),
                min_agents=requirements.get("min_agents", 0),
                max_agents=requirements.get("max_agents", 0),
                min_confidence=requirements.get("min_confidence", 0.0),
            )
            pattern_msg.requirements.CopyFrom(req_msg)

        metadata = pattern.get("metadata")
        if metadata:
            meta_struct = struct_pb2.Struct()
            ParseDict(metadata, meta_struct)
            pattern_msg.metadata.CopyFrom(meta_struct)

        request = patterns_pb2.UploadPatternRequest(
            pattern=pattern_msg,
            overwrite=overwrite,
        )
        response = await self._stub.UploadPattern(request)
        return {
            "success": response.success,
            "message": response.message,
            "pattern_id": response.pattern_id,
        }

    async def close(self) -> None:
        """Close the underlying gRPC channel."""
        if self._channel:
            await self._channel.close()
