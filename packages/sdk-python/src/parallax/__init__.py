"""
Parallax Python SDK

AI agent orchestration with uncertainty as a first-class citizen.
"""

from .agent import ParallaxAgent
from .server import serve_agent, create_and_serve
from .types import AgentResult, Capabilities
from .confidence import (
    with_confidence,
    extract_confidence,
    ConfidenceAggregator,
    require_confidence
)

__version__ = "0.1.0"

__all__ = [
    "ParallaxAgent",
    "serve_agent",
    "create_and_serve",
    "AgentResult",
    "Capabilities",
    "with_confidence",
    "extract_confidence",
    "ConfidenceAggregator",
    "require_confidence",
]