#!/usr/bin/env python3
"""
Standardized SDK Test for Python
All SDKs must pass these exact same tests
"""

import asyncio
import sys
from typing import Dict, Any

from parallax import ParallaxAgent
from typing import Tuple


class TestAgent(ParallaxAgent):
    """Test agent implementation"""
    
    def __init__(self):
        super().__init__(
            agent_id="test-agent-py",
            name="Test Agent (Python)",
            capabilities=["analysis", "validation"],
            metadata={"expertise": 0.85}
        )
    
    async def analyze(self, task: str, data: Dict[str, Any] = None) -> Tuple[Any, float]:
        if task == "analyze":
            input_data = data or {}
            content_data = input_data.get("data", {})
            return (
                {
                    "summary": f"Analyzed {content_data.get('type', 'unknown')} content",
                    "length": len(content_data.get("content", "")),
                    "result": "Analysis complete"
                },
                0.85
            )
        
        elif task == "validate":
            input_data = data or {}
            validate_data = input_data.get("data", {})
            value = validate_data.get("value")
            rules = validate_data.get("rules", [])
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
            
            return (
                {"valid": valid, "details": details},
                0.95
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
            agent.id == "test-agent-py" and
            "analysis" in agent.capabilities and
            "validation" in agent.capabilities
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
        result, confidence = response
        passed = confidence >= 0.7 and result is not None
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
        result, confidence = response
        passed = (
            result["valid"] is True and
            confidence == 0.95 and
            len(result["details"]) == 2
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
    print("Test 5: Client API (optional)........ SKIP (Client not implemented yet)")
    
    # Summary
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\nSummary: {passed}/{total} tests passed")
    
    return passed == total


if __name__ == "__main__":
    success = asyncio.run(run_standardized_tests())
    sys.exit(0 if success else 1)