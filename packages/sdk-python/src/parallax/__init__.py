"""
Parallax Python SDK

AI agent orchestration with uncertainty as a first-class citizen.
"""

from .agent import ParallaxAgent
from .confidence import (
    ConfidenceAggregator,
    extract_confidence,
    require_confidence,
    with_confidence,
)
from .execution_client import ExecutionClient
from .pattern_client import PatternClient
from .server import create_and_serve, serve_agent
from .types import AgentResult, Capabilities, GatewayOptions

__version__ = "0.1.0"

__all__ = [
    "ParallaxAgent",
    "serve_agent",
    "create_and_serve",
    "AgentResult",
    "Capabilities",
    "GatewayOptions",
    "PatternClient",
    "ExecutionClient",
    "with_confidence",
    "extract_confidence",
    "ConfidenceAggregator",
    "require_confidence",
]
