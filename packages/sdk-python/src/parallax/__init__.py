"""
Parallax Python SDK

AI agent orchestration with uncertainty as a first-class citizen.
"""

from .agent import ParallaxAgent
from .decorators import capability, confidence_threshold
from .server import serve_agent, create_and_serve
from .types import AgentResult, Capabilities

__version__ = "0.1.0"

__all__ = [
    "ParallaxAgent",
    "serve_agent",
    "create_and_serve",
    "capability",
    "confidence_threshold",
    "AgentResult",
    "Capabilities",
]