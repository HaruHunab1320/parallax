"""Type definitions for the Parallax Python SDK."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union


@dataclass
class AgentResult:
    """Result from an agent's analysis."""
    
    value: Any
    confidence: float
    agent: str
    reasoning: Optional[str] = None
    uncertainties: Optional[List[str]] = None
    timestamp: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "value": self.value,
            "confidence": self.confidence,
            "agent": self.agent,
        }
        if self.reasoning:
            result["reasoning"] = self.reasoning
        if self.uncertainties:
            result["uncertainties"] = self.uncertainties
        if self.timestamp:
            result["timestamp"] = self.timestamp
        return result


@dataclass
class Capabilities:
    """Agent capabilities information."""
    
    agent_id: str
    name: str
    capabilities: List[str]
    expertise_level: float = 0.5
    capability_scores: Optional[Dict[str, float]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "agent_id": self.agent_id,
            "name": self.name,
            "capabilities": self.capabilities,
            "expertise_level": self.expertise_level,
        }
        if self.capability_scores:
            result["capability_scores"] = self.capability_scores
        return result


@dataclass
class HealthStatus:
    """Agent health status."""
    
    status: str  # 'healthy', 'unhealthy', 'degraded'
    message: Optional[str] = None
    last_check: Optional[str] = None
    
    def is_healthy(self) -> bool:
        """Check if agent is healthy."""
        return self.status == 'healthy'


# Type alias for agent analyze return value
AnalyzeResult = Tuple[Any, float]