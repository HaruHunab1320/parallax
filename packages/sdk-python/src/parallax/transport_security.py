"""Control-plane service credentials shared by unary and streaming clients."""

import os
import ssl
from pathlib import Path
from typing import Optional, Sequence, Tuple

import grpc

Metadata = Sequence[Tuple[str, str]]


def control_plane_metadata(metadata: Optional[Metadata] = None, api_key: Optional[str] = None):
    """Preserve caller metadata; supply the environment key only when absent."""
    result = list(metadata or ())
    key = api_key if api_key is not None else os.getenv("PARALLAX_GRPC_API_KEY")
    if key and not any(name.lower() == "x-parallax-api-key" for name, _ in result):
        result.append(("x-parallax-api-key", key))
    return tuple(result)


def control_plane_channel(endpoint: str, credentials=None):
    """Use explicit credentials or validated client TLS environment settings."""
    if credentials is not None:
        return grpc.aio.secure_channel(endpoint, credentials)
    enabled = os.getenv("PARALLAX_GRPC_TLS_ENABLED")
    if enabled is not None and enabled not in ("true", "false"):
        raise ValueError("PARALLAX_GRPC_TLS_ENABLED must be true or false")
    ca = os.getenv("PARALLAX_GRPC_CLIENT_TLS_CA")
    cert = os.getenv("PARALLAX_GRPC_CLIENT_TLS_CERT")
    key = os.getenv("PARALLAX_GRPC_CLIENT_TLS_KEY")
    configured = bool(ca or cert or key)
    if enabled == "false" and configured:
        raise ValueError("Client TLS files require TLS to be enabled")
    if bool(cert) != bool(key):
        raise ValueError("Client TLS certificate and key must be configured together")
    if enabled != "true" and not configured:
        return grpc.aio.insecure_channel(endpoint)
    context = ssl.create_default_context(cafile=ca)
    if cert:
        context.load_cert_chain(certfile=cert, keyfile=key)
    credentials = grpc.ssl_channel_credentials(
        root_certificates=Path(ca).read_bytes() if ca else None,
        private_key=Path(key).read_bytes() if key else None,
        certificate_chain=Path(cert).read_bytes() if cert else None,
    )
    return grpc.aio.secure_channel(endpoint, credentials)
