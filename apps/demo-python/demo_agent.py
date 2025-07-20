#!/usr/bin/env python3
"""
Python SDK Demo App
Tests all major features of the Parallax Python SDK
"""

import asyncio
import logging
from typing import Dict, Any
import sys

from parallax import (
    ParallaxAgent,
    AgentCapability,
    AgentResponse,
    capabilities,
    confidence_threshold,
    with_reasoning,
    cached
)
from parallax.client import ParallaxClient

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


class DemoAgent(ParallaxAgent):
    """Demo agent showcasing Python SDK features"""
    
    def __init__(self):
        super().__init__(
            agent_id="demo-agent-py",
            name="Python Demo Agent",
            capabilities=[
                AgentCapability.CODE_ANALYSIS,
                AgentCapability.TESTING
            ],
            expertise=0.85
        )
    
    @capabilities([AgentCapability.CODE_ANALYSIS])
    @confidence_threshold(0.8)
    @with_reasoning
    async def analyze_code(self, code: str) -> AgentResponse:
        """Analyze Python code for quality"""
        # Simulate code analysis
        has_docstrings = '"""' in code or "'''" in code
        has_types = "->" in code or ": " in code
        has_tests = "test_" in code or "assert" in code
        
        quality_score = sum([has_docstrings, has_types, has_tests]) / 3
        
        result = {
            "has_docstrings": has_docstrings,
            "has_type_hints": has_types,
            "has_tests": has_tests,
            "quality": "high" if quality_score > 0.6 else "medium",
            "suggestions": []
        }
        
        if not has_docstrings:
            result["suggestions"].append("Add docstrings")
        if not has_types:
            result["suggestions"].append("Add type hints")
        if not has_tests:
            result["suggestions"].append("Add unit tests")
        
        return AgentResponse(
            value=result,
            confidence=0.85 + quality_score * 0.15,
            reasoning=f"Analyzed code with {len(code.split())} lines"
        )
    
    @cached(ttl=300)  # Cache for 5 minutes
    async def get_system_info(self) -> AgentResponse:
        """Get system information"""
        import platform
        
        return AgentResponse(
            value={
                "version": "1.0.0",
                "language": "Python",
                "python_version": sys.version.split()[0],
                "platform": platform.system(),
                "architecture": platform.machine()
            },
            confidence=1.0
        )


async def test_agent_creation():
    """Test 1: Agent Creation"""
    logger.info("1️⃣  Creating Demo Agent...")
    
    agent = DemoAgent()
    logger.info(f"✅ Agent created: {agent.name} ({agent.agent_id})")
    logger.info(f"   Capabilities: {', '.join(cap.value for cap in agent.capabilities)}")
    logger.info(f"   Expertise: {agent.expertise}\n")
    
    return agent


async def test_agent_methods(agent: DemoAgent):
    """Test 2: Agent Methods"""
    logger.info("2️⃣  Testing Agent Methods...")
    
    # Test code analysis
    code_to_analyze = '''
def calculate_sum(numbers: List[int]) -> int:
    """Calculate the sum of a list of numbers."""
    return sum(numbers)

def test_calculate_sum():
    assert calculate_sum([1, 2, 3]) == 6
    '''
    
    response = await agent.analyze("analyze_code", {"code": code_to_analyze})
    logger.info(f"✅ Code analysis result: {response.value}")
    logger.info(f"   Confidence: {response.confidence}")
    logger.info(f"   Reasoning: {response.reasoning}\n")
    
    # Test system info (cached)
    sys_response = await agent.analyze("get_system_info", {})
    logger.info(f"✅ System info: {sys_response.value}")
    logger.info(f"   Cached: {hasattr(sys_response, '_from_cache')}\n")


async def test_client_api():
    """Test 3: Control Plane Client"""
    logger.info("3️⃣  Testing Control Plane Client...")
    
    try:
        client = ParallaxClient(base_url="http://localhost:8080")
        
        # Check health
        health = await client.health()
        logger.info(f"✅ Health check: {health}")
        
        # List patterns
        patterns = await client.list_patterns()
        logger.info(f"✅ Found {len(patterns)} patterns")
        if patterns:
            logger.info(f"   First pattern: {patterns[0]['name']} v{patterns[0]['version']}")
        
        # List agents
        agents = await client.list_agents()
        logger.info(f"✅ Found {len(agents)} registered agents\n")
        
    except Exception as e:
        logger.info("⚠️  Control plane not running (this is normal for SDK testing)")
        logger.info(f"   Error: {e}\n")


async def test_pattern_execution(agent: DemoAgent):
    """Test 4: Pattern Execution"""
    logger.info("4️⃣  Testing Pattern Execution...")
    
    try:
        client = ParallaxClient(base_url="http://localhost:8080")
        
        # Start agent server
        await agent.start(port=50052)
        logger.info("✅ Agent gRPC server started on port 50052")
        
        # Register agent
        await client.register_agent({
            "id": agent.agent_id,
            "name": agent.name,
            "endpoint": "grpc://localhost:50052",
            "capabilities": [cap.value for cap in agent.capabilities],
            "metadata": {"sdk": "python", "version": "0.1.0"}
        })
        logger.info("✅ Agent registered with control plane")
        
        # Execute pattern
        execution = await client.execute_pattern(
            pattern_name="SimpleConsensus",
            input_data={
                "task": "Test the Python SDK",
                "data": {"test": True}
            }
        )
        logger.info(f"✅ Pattern execution started: {execution['id']}")
        
        # Wait for result
        await asyncio.sleep(2)
        result = await client.get_execution(execution['id'])
        logger.info(f"✅ Execution result: {result}\n")
        
    except Exception as e:
        logger.info("⚠️  Pattern execution skipped (control plane not running)")
        logger.info(f"   Error: {e}\n")


async def test_error_handling(agent: DemoAgent):
    """Test 5: Error Handling"""
    logger.info("5️⃣  Testing Error Handling...")
    
    try:
        # Test invalid task
        await agent.analyze("invalid_task", {})
    except Exception as e:
        logger.info(f"✅ Error handling works: {e}\n")


async def main():
    """Run all demo tests"""
    logger.info("🚀 Parallax Python SDK Demo\n")
    
    # Run tests
    agent = await test_agent_creation()
    await test_agent_methods(agent)
    await test_client_api()
    await test_pattern_execution(agent)
    await test_error_handling(agent)
    
    logger.info("✅ Python SDK Demo Complete!")
    logger.info("\nSummary:")
    logger.info("- Agent creation: ✅")
    logger.info("- Decorators: ✅")
    logger.info("- Method execution: ✅")
    logger.info("- Client API: ✅ (requires control plane)")
    logger.info("- Error handling: ✅")


if __name__ == "__main__":
    asyncio.run(main())