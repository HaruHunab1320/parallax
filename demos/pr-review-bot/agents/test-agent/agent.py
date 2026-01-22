#!/usr/bin/env python3
"""
Test Assessment Agent for PR Review Bot

Analyzes code for testability and test coverage indicators using Gemini LLM.
Demonstrates a Python agent in the Parallax multi-language ecosystem.
"""

import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent.parent.parent / "packages" / "sdk-python" / "src"
sys.path.insert(0, str(sdk_path))

from parallax import ParallaxAgent, serve_agent

# Optional: Gemini integration
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google-generativeai not installed. Using fallback analysis.")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Testability patterns
TESTABILITY_PATTERNS = [
    {
        "pattern": r"new\s+\w+\s*\(",
        "severity": "medium",
        "issue": "Direct instantiation makes dependency injection difficult",
        "suggestion": "Inject dependencies through constructor or factory"
    },
    {
        "pattern": r"fetch\s*\(|axios\.|http\.|request\(",
        "severity": "medium",
        "issue": "Direct HTTP calls are hard to mock in tests",
        "suggestion": "Abstract HTTP calls behind an interface/service"
    },
    {
        "pattern": r"Date\.now\(\)|new Date\(\)",
        "severity": "low",
        "issue": "Direct date/time calls make time-dependent tests flaky",
        "suggestion": "Inject a clock/time provider for testability"
    },
    {
        "pattern": r"Math\.random\(\)",
        "severity": "low",
        "issue": "Random values make tests non-deterministic",
        "suggestion": "Inject a random number generator for testability"
    },
    {
        "pattern": r"process\.env\.",
        "severity": "low",
        "issue": "Direct environment access can make tests environment-dependent",
        "suggestion": "Inject configuration rather than reading directly"
    },
    {
        "pattern": r"global\.|window\.|document\.",
        "severity": "medium",
        "issue": "Global state access makes isolated testing difficult",
        "suggestion": "Pass dependencies explicitly or use dependency injection"
    }
]

# Positive test indicators
TEST_INDICATORS = [
    r"describe\s*\(",
    r"it\s*\(",
    r"test\s*\(",
    r"expect\s*\(",
    r"assert",
    r"@Test",
    r"def test_",
    r"class Test",
]


class TestAssessmentAgent(ParallaxAgent):
    """Agent that assesses code testability and test coverage."""

    def __init__(self):
        super().__init__(
            agent_id="test-agent",
            name="Test Assessment Analyzer",
            capabilities=["testing", "testability", "coverage-assessment"],
            metadata={
                "expertise": 0.85,
                "language": "python",
                "description": "Assesses code testability and test coverage"
            }
        )

        self.gemini_model = None
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                self.gemini_model = genai.GenerativeModel("gemini-2.0-flash")
                logger.info("Gemini LLM initialized for test assessment")
            else:
                logger.warning("GEMINI_API_KEY not set - using pattern-based analysis")

    async def analyze(self, task: str, data: Optional[Any] = None) -> Tuple[Any, float]:
        """
        Analyze code for testability and test coverage.

        Args:
            task: Description of the analysis task
            data: Dict containing 'code' to analyze

        Returns:
            Tuple of (result_dict, confidence)
        """
        code = ""
        if isinstance(data, dict):
            code = data.get("code", "")
        elif isinstance(data, str):
            code = data

        if not code:
            return ({
                "findings": [],
                "summary": "No code provided for analysis",
                "testability_score": 0,
            }, 0.5)

        if self.gemini_model:
            try:
                result, confidence = await self._analyze_with_llm(code)
                return (result, confidence)
            except Exception as e:
                logger.warning(f"LLM analysis failed, falling back to patterns: {e}")

        return self._analyze_with_patterns(code)

    async def _analyze_with_llm(self, code: str) -> Tuple[Dict, float]:
        """Analyze code using Gemini LLM."""
        prompt = f"""Analyze the following code for testability and testing concerns.

For each issue found, provide:
- severity: "high", "medium", or "low"
- issue: Brief description of the testability problem
- line_hint: Approximate location in the code
- suggestion: How to make it more testable

Also provide:
- testability_score: 0-100 rating of how testable this code is
- has_tests: Whether the code appears to include tests
- test_suggestions: Specific tests that should be written
- confidence: Your confidence in this analysis (0.0 to 1.0)

Focus on:
- Dependency injection opportunities
- Hard-coded dependencies
- Global state usage
- Side effects that are hard to mock
- Complex methods that need breaking down
- Missing test coverage for critical paths

Respond in JSON format:
{{
  "findings": [
    {{"severity": "...", "issue": "...", "line_hint": "...", "suggestion": "..."}}
  ],
  "summary": "Overall testability assessment",
  "testability_score": 70,
  "has_tests": false,
  "test_suggestions": ["Test case 1", "Test case 2"],
  "confidence": 0.85,
  "reasoning": "Why you are this confident"
}}

Code to analyze:
```
{code}
```"""

        response = await asyncio.to_thread(
            self.gemini_model.generate_content,
            prompt
        )

        text = response.text

        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if json_match:
            text = json_match.group(1)

        try:
            result = json.loads(text)
            confidence = result.get("confidence", 0.75)
            confidence = max(0.0, min(1.0, float(confidence)))
            return (result, confidence)
        except json.JSONDecodeError:
            return ({
                "findings": [],
                "summary": text[:500],
                "testability_score": 50,
            }, 0.5)

    def _analyze_with_patterns(self, code: str) -> Tuple[Dict, float]:
        """Analyze code using patterns (fallback)."""
        findings = []

        # Check for testability issues
        for pattern_def in TESTABILITY_PATTERNS:
            matches = re.finditer(pattern_def["pattern"], code, re.IGNORECASE)
            for match in matches:
                line_num = code[:match.start()].count('\n') + 1
                findings.append({
                    "severity": pattern_def["severity"],
                    "issue": pattern_def["issue"],
                    "line_hint": f"Line {line_num}",
                    "suggestion": pattern_def["suggestion"]
                })

        # Check for existing tests
        has_tests = any(re.search(pattern, code) for pattern in TEST_INDICATORS)

        # Calculate testability score
        # Start at 80, deduct for issues
        deductions = sum(
            10 if f["severity"] == "high" else 5 if f["severity"] == "medium" else 2
            for f in findings
        )
        testability_score = max(0, 80 - deductions)

        # Bonus if code already has tests
        if has_tests:
            testability_score = min(100, testability_score + 15)

        # Generate test suggestions
        test_suggestions = []
        if re.search(r"function\s+(\w+)", code):
            functions = re.findall(r"function\s+(\w+)", code)
            for func in functions[:3]:  # Limit to first 3
                test_suggestions.append(f"Unit test for {func}()")

        base_confidence = 0.65
        confidence = min(0.8, base_confidence + len(findings) * 0.02)

        return ({
            "findings": findings,
            "summary": f"Found {len(findings)} testability concern(s)",
            "testability_score": testability_score,
            "has_tests": has_tests,
            "test_suggestions": test_suggestions,
            "reasoning": "Pattern-based analysis (LLM not available)",
            "analysis_method": "pattern_matching"
        }, confidence)


async def main():
    """Start the Test Assessment Agent."""
    agent = TestAssessmentAgent()

    loop = asyncio.get_event_loop()

    def handle_shutdown():
        logger.info("Shutting down Test Assessment Agent...")
        asyncio.create_task(agent.shutdown())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_shutdown)

    port = int(os.getenv("AGENT_PORT", "50103"))
    await agent.serve(port)

    logger.info(f"Test Assessment Agent running on port {port}")
    logger.info("Press Ctrl+C to stop")

    await agent.wait_for_termination()


if __name__ == "__main__":
    import signal
    asyncio.run(main())
