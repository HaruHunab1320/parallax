"""Tests for Parallax Python SDK agent functionality."""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock

from parallax import ParallaxAgent
from parallax.types import HealthStatus, AgentResult


class TestAgent(ParallaxAgent):
    """Test implementation of ParallaxAgent."""
    
    def __init__(self):
        super().__init__(
            "test-agent-1",
            "Test Agent",
            ["test", "analysis"],
            {"expertise": 0.85}
        )
    
    async def analyze(self, task: str, data=None):
        if task == "simple":
            return {"result": "success"}, 0.95
        elif task == "complex":
            return {
                "result": "analyzed",
                "data": data,
                "reasoning": "Complex analysis performed",
                "uncertainties": ["Limited data", "Model assumptions"]
            }, 0.75
        else:
            return {"error": "Unknown task"}, 0.1


class TestParallaxAgent:
    """Test cases for ParallaxAgent base class."""
    
    @pytest.fixture
    def agent(self):
        """Create a test agent instance."""
        return TestAgent()
    
    def test_agent_initialization(self, agent):
        """Test agent is initialized with correct properties."""
        assert agent.id == "test-agent-1"
        assert agent.name == "Test Agent"
        assert agent.capabilities == ["test", "analysis"]
        assert agent.metadata["expertise"] == 0.85
    
    @pytest.mark.asyncio
    async def test_analyze_simple_task(self, agent):
        """Test analyzing a simple task."""
        result, confidence = await agent.analyze("simple")
        
        assert result["result"] == "success"
        assert confidence == 0.95
    
    @pytest.mark.asyncio
    async def test_analyze_complex_task(self, agent):
        """Test analyzing a complex task with data."""
        test_data = {"input": "test_value"}
        result, confidence = await agent.analyze("complex", test_data)
        
        assert result["result"] == "analyzed"
        assert result["data"] == test_data
        assert result["reasoning"] == "Complex analysis performed"
        assert len(result["uncertainties"]) == 2
        assert confidence == 0.75
    
    @pytest.mark.asyncio
    async def test_analyze_unknown_task(self, agent):
        """Test handling of unknown tasks."""
        result, confidence = await agent.analyze("unknown")
        
        assert result["error"] == "Unknown task"
        assert confidence == 0.1
    
    @pytest.mark.asyncio
    async def test_health_check_default(self, agent):
        """Test default health check returns healthy."""
        health = await agent.check_health()
        
        assert health.status == "healthy"
        assert health.message == "Agent is operational"
        assert health.last_check is not None
    
    @pytest.mark.asyncio
    async def test_custom_health_check(self):
        """Test custom health check implementation."""
        class UnhealthyAgent(ParallaxAgent):
            def __init__(self):
                super().__init__("unhealthy-1", "Unhealthy Agent", [])
            
            async def analyze(self, task, data=None):
                return {}, 0
            
            async def check_health(self):
                return HealthStatus(
                    status="degraded",
                    message="Low memory"
                )
        
        agent = UnhealthyAgent()
        health = await agent.check_health()
        
        assert health.status == "degraded"
        assert health.message == "Low memory"
    
    def test_get_capabilities(self, agent):
        """Test getting agent capabilities."""
        caps = agent.get_capabilities()
        
        assert caps.agent_id == "test-agent-1"
        assert caps.name == "Test Agent"
        assert caps.capabilities == ["test", "analysis"]
        assert caps.expertise_level == 0.85
    
    @pytest.mark.asyncio
    @patch('grpc.aio.server')
    async def test_serve_starts_grpc_server(self, mock_server, agent):
        """Test that serve starts a gRPC server."""
        mock_server_instance = AsyncMock()
        mock_server_instance.add_insecure_port.return_value = 50051
        mock_server_instance.start = AsyncMock()
        mock_server.return_value = mock_server_instance
        
        port = await agent.serve(50051)
        
        assert port == 50051
        mock_server.assert_called_once()
        mock_server_instance.start.assert_called_once()
    
    def test_agent_with_metadata(self):
        """Test agent with custom metadata."""
        agent = ParallaxAgent(
            "meta-1",
            "Metadata Agent",
            ["analysis", "synthesis"],
            {
                "expertise": 0.9,
                "capability_scores": {
                    "analysis": 0.95,
                    "synthesis": 0.85
                },
                "version": "2.0.0"
            }
        )
        
        assert agent.metadata["expertise"] == 0.9
        assert agent.metadata["version"] == "2.0.0"
        assert agent.metadata["capability_scores"]["analysis"] == 0.95


class TestAgentResult:
    """Test cases for AgentResult type."""
    
    def test_agent_result_creation(self):
        """Test creating an AgentResult."""
        result = AgentResult(
            value={"answer": 42},
            confidence=0.85,
            agent="test-agent",
            reasoning="Calculated based on input",
            uncertainties=["Assumption A", "Assumption B"]
        )
        
        assert result.value == {"answer": 42}
        assert result.confidence == 0.85
        assert result.agent == "test-agent"
        assert result.reasoning == "Calculated based on input"
        assert len(result.uncertainties) == 2
    
    def test_agent_result_to_dict(self):
        """Test converting AgentResult to dictionary."""
        result = AgentResult(
            value="test",
            confidence=0.9,
            agent="agent-1"
        )
        
        result_dict = result.to_dict()
        
        assert result_dict["value"] == "test"
        assert result_dict["confidence"] == 0.9
        assert result_dict["agent"] == "agent-1"
        assert "reasoning" not in result_dict  # Optional field
        assert "uncertainties" not in result_dict  # Optional field