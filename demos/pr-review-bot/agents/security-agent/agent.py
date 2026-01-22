#!/usr/bin/env python3
"""
Security Agent for PR Review Bot

Analyzes code for security vulnerabilities using Gemini LLM.
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


# Security patterns to check (fallback when no LLM)
SECURITY_PATTERNS = [
    {
        "pattern": r"eval\s*\(",
        "severity": "critical",
        "issue": "Use of eval() can lead to code injection",
        "suggestion": "Avoid eval() - use safer alternatives like JSON.parse() for data"
    },
    {
        "pattern": r"innerHTML\s*=",
        "severity": "high",
        "issue": "Direct innerHTML assignment can lead to XSS",
        "suggestion": "Use textContent or sanitize HTML before insertion"
    },
    {
        "pattern": r"SELECT.*FROM.*WHERE.*\+|SELECT.*FROM.*WHERE.*\$\{|SELECT.*FROM.*WHERE.*'.*'",
        "severity": "critical",
        "issue": "Potential SQL injection - query built with string concatenation",
        "suggestion": "Use parameterized queries or an ORM"
    },
    {
        "pattern": r"(password|api_key|secret|token)\s*=\s*['\"][^'\"]+['\"]",
        "severity": "critical",
        "issue": "Hardcoded credentials detected",
        "suggestion": "Use environment variables or a secrets manager"
    },
    {
        "pattern": r"fetch\s*\([^)]*\+|fetch\s*\([^)]*\$\{",
        "severity": "high",
        "issue": "URL constructed with user input - potential SSRF",
        "suggestion": "Validate and sanitize URLs before fetching"
    },
    {
        "pattern": r"document\.write\s*\(",
        "severity": "high",
        "issue": "document.write can be exploited for XSS",
        "suggestion": "Use DOM manipulation methods instead"
    },
    {
        "pattern": r"exec\s*\(|execSync\s*\(",
        "severity": "critical",
        "issue": "Command execution can lead to shell injection",
        "suggestion": "Avoid exec - use specific APIs for the task"
    }
]


class SecurityAgent(ParallaxAgent):
    """Agent that analyzes code for security vulnerabilities."""

    def __init__(self):
        super().__init__(
            agent_id="security-agent",
            name="Security Analyzer",
            capabilities=["security", "code-analysis", "vulnerability-detection"],
            metadata={
                "expertise": 0.9,
                "language": "python",
                "description": "Analyzes code for security vulnerabilities"
            }
        )

        # Initialize Gemini if available
        self.gemini_model = None
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                self.gemini_model = genai.GenerativeModel("gemini-2.0-flash")
                logger.info("Gemini LLM initialized for security analysis")
            else:
                logger.warning("GEMINI_API_KEY not set - using pattern-based analysis")

    async def analyze(self, task: str, data: Optional[Any] = None) -> Tuple[Any, float]:
        """
        Analyze code for security vulnerabilities.

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
                "severity": "none",
                "reasoning": "Empty input"
            }, 0.5)

        # Try LLM analysis first
        if self.gemini_model:
            try:
                result, confidence = await self._analyze_with_llm(code)
                return (result, confidence)
            except Exception as e:
                logger.warning(f"LLM analysis failed, falling back to patterns: {e}")

        # Fallback to pattern-based analysis
        return self._analyze_with_patterns(code)

    async def _analyze_with_llm(self, code: str) -> Tuple[Dict, float]:
        """Analyze code using Gemini LLM."""
        prompt = f"""Analyze the following code for security vulnerabilities.

For each issue found, provide:
- severity: "critical", "high", "medium", or "low"
- issue: Brief description of the vulnerability
- line_hint: Approximate location in the code
- suggestion: How to fix it

Also assess your confidence in the analysis (0.0 to 1.0).

Respond in JSON format:
{{
  "findings": [
    {{"severity": "...", "issue": "...", "line_hint": "...", "suggestion": "..."}}
  ],
  "summary": "Overall security assessment",
  "overall_severity": "critical|high|medium|low|none",
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

        # Parse response
        text = response.text

        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if json_match:
            text = json_match.group(1)

        try:
            result = json.loads(text)
            confidence = result.get("confidence", 0.75)

            # Validate confidence is in range
            confidence = max(0.0, min(1.0, float(confidence)))

            return (result, confidence)
        except json.JSONDecodeError:
            # If JSON parsing fails, create structured response from text
            return ({
                "findings": [],
                "summary": text[:500],
                "overall_severity": "unknown",
                "reasoning": "Could not parse structured response"
            }, 0.5)

    def _analyze_with_patterns(self, code: str) -> Tuple[Dict, float]:
        """Analyze code using regex patterns (fallback)."""
        findings = []

        for pattern_def in SECURITY_PATTERNS:
            matches = re.finditer(pattern_def["pattern"], code, re.IGNORECASE)
            for match in matches:
                # Find line number
                line_num = code[:match.start()].count('\n') + 1

                findings.append({
                    "severity": pattern_def["severity"],
                    "issue": pattern_def["issue"],
                    "line_hint": f"Line {line_num}",
                    "suggestion": pattern_def["suggestion"],
                    "matched_text": match.group(0)[:50]  # First 50 chars of match
                })

        # Determine overall severity
        severities = [f["severity"] for f in findings]
        if "critical" in severities:
            overall = "critical"
        elif "high" in severities:
            overall = "high"
        elif "medium" in severities:
            overall = "medium"
        elif "low" in severities:
            overall = "low"
        else:
            overall = "none"

        # Calculate confidence based on findings
        # Pattern matching is deterministic but may miss things
        base_confidence = 0.7
        if len(findings) > 0:
            confidence = min(0.85, base_confidence + len(findings) * 0.03)
        else:
            # No findings could mean clean code OR missed vulnerabilities
            confidence = 0.6

        summary = f"Found {len(findings)} potential security issue(s)" if findings else "No obvious security issues detected"

        return ({
            "findings": findings,
            "summary": summary,
            "overall_severity": overall,
            "reasoning": "Pattern-based analysis (LLM not available)",
            "analysis_method": "pattern_matching"
        }, confidence)


async def main():
    """Start the Security Agent."""
    agent = SecurityAgent()

    # Handle shutdown gracefully
    loop = asyncio.get_event_loop()

    def handle_shutdown():
        logger.info("Shutting down Security Agent...")
        asyncio.create_task(agent.shutdown())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_shutdown)

    # Start serving
    port = int(os.getenv("AGENT_PORT", "50100"))
    await agent.serve(port)

    logger.info(f"Security Agent running on port {port}")
    logger.info("Press Ctrl+C to stop")

    # Wait for termination
    await agent.wait_for_termination()


if __name__ == "__main__":
    import signal
    asyncio.run(main())
