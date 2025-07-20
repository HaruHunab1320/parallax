#!/usr/bin/env python3
"""
Standardized SDK Test for Python
All SDKs must pass these exact same tests
"""

import asyncio
import sys
from typing import Dict, Any

from parallax import ParallaxAgent, AgentResponse
from parallax.client import ParallaxClient


class TestAgent(ParallaxAgent):
    """Test agent implementation"""
    
    def __init__(self):
        super().__init__(
            agent_id="test-agent-py",
            name="Test Agent (Python)",
            capabilities=["analysis", "validation"],
            expertise=0.85
        )
    
    async def analyze(self, task: str, input_data: Dict[str, Any]) -> AgentResponse:
        if task == "analyze":
            data = input_data.get("data", {})
            return AgentResponse(
                value={
                    "summary": f"Analyzed {data.get('type', 'unknown')} content",
                    "length": len(data.get("content", "")),
                    "result": "Analysis complete"
                },
                confidence=0.85,
                reasoning="Standard analysis performed"
            )
        
        elif task == "validate":
            data = input_data.get("data", {})
            value = data.get("value")
            rules = data.get("rules", [])
            details = []
            valid = True
            
            if "positive" in rules:
                if value > 0:
                    details.append("Value is positive")
                else:
                    valid = False
                    details.append("Value is not positive")
            
            if "even" in rules:
                if value % 2 == 0:
                    details.append("Value is even")
                else:
                    valid = False
                    details.append("Value is not even")
            
            return AgentResponse(
                value={"valid": valid, "details": details},
                confidence=0.95,
                reasoning="Validation rules applied"
            )
        
        else:
            raise ValueError(f"Unknown task: {task}")


async def run_standardized_tests():
    """Run all standardized tests"""
    print("=== Parallax SDK Test Results ===")
    print("Language: Python")
    print("SDK Version: 0.1.0\n")
    
    results = {}
    
    # Test 1: Agent Creation
    try:
        agent = TestAgent()
        passed = (
            agent.agent_id == "test-agent-py" and
            "analysis" in [c.value for c in agent.capabilities] and
            "validation" in [c.value for c in agent.capabilities]
        )
        results["Agent Creation"] = passed
        print(f"Test 1: Agent Creation............... {'PASS' if passed else 'FAIL'}")
    except Exception as e:
        results["Agent Creation"] = False
        print(f"Test 1: Agent Creation............... FAIL ({e})")
    
    # Test 2: Simple Analysis
    try:
        agent = TestAgent()
        response = await agent.analyze("analyze", {
            "data": {
                "content": "Test data for analysis",
                "type": "text"
            }
        })
        passed = response.confidence >= 0.7 and response.value is not None
        results["Simple Analysis"] = passed
        print(f"Test 2: Simple Analysis.............. {'PASS' if passed else 'FAIL'}")
    except Exception as e:
        results["Simple Analysis"] = False
        print(f"Test 2: Simple Analysis.............. FAIL ({e})")
    
    # Test 3: Validation
    try:
        agent = TestAgent()
        response = await agent.analyze("validate", {
            "data": {
                "value": 42,
                "rules": ["positive", "even"]
            }
        })
        passed = (
            response.value["valid"] is True and
            response.confidence == 0.95 and
            len(response.value["details"]) == 2
        )
        results["Validation"] = passed
        print(f"Test 3: Validation................... {'PASS' if passed else 'FAIL'}")
    except Exception as e:
        results["Validation"] = False
        print(f"Test 3: Validation................... FAIL ({e})")
    
    # Test 4: Error Handling
    try:
        agent = TestAgent()
        await agent.analyze("unknown-task", {})
        results["Error Handling"] = False
        print("Test 4: Error Handling............... FAIL (No error thrown)")
    except Exception as e:
        passed = "unknown task" in str(e).lower()
        results["Error Handling"] = passed
        print(f"Test 4: Error Handling............... {'PASS' if passed else 'FAIL'}")
    
    # Test 5: Client API (optional)
    try:
        client = ParallaxClient(base_url="http://localhost:8080")
        
        # 5.1 Health Check
        health = await client.health()
        
        # 5.2 List Patterns
        patterns = await client.list_patterns()
        
        # 5.3 Pattern Execution
        execution = await client.execute_pattern("SimpleConsensus", {
            "task": "SDK test",
            "data": {"test": True}
        })
        
        passed = (
            health.get("status") == "healthy" and
            len(patterns) > 0 and
            execution.get("id") is not None
        )
        results["Client API"] = passed
        print(f"Test 5: Client API (optional)........ {'PASS' if passed else 'FAIL'}")
    except Exception:
        print("Test 5: Client API (optional)........ SKIP (Control plane not running)")
    
    # Summary
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\nSummary: {passed}/{total} tests passed")
    
    return passed == total


if __name__ == "__main__":
    success = asyncio.run(run_standardized_tests())
    sys.exit(0 if success else 1)