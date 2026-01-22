# PR Review Bot Demo

A multi-agent code review system demonstrating Parallax's core value proposition:
**Agents as microservices with declarative orchestration.**

## Status: TESTED AND WORKING

Last tested: January 2026

## What This Demo Proves

1. **Multi-language agents** - Python and TypeScript agents working together
2. **Real LLM integration** - Gemini-powered analysis (with pattern-based fallback)
3. **Confidence-aware orchestration** - Prism pattern makes decisions based on agent confidence
4. **Service discovery** - Agents register dynamically via etcd, pattern finds them by capability
5. **Useful output** - Structured code review with confidence-annotated findings

## Architecture

```
                         Code Input
                              |
                              v
+-------------------------------------------------------------+
|                      Control Plane                           |
|                   (Prism Pattern Engine)                     |
+-------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
    +-----------+       +-----------+       +-----------+
    | Security  |       |   Style   |       |   Docs    |
    |   Agent   |       |   Agent   |       |   Agent   |
    | (Python)  |       |   (TS)    |       |   (TS)    |
    +-----------+       +-----------+       +-----------+
          |                   |                   |
          v                   v                   v
    +-----------+
    |   Test    |
    |   Agent   |
    | (Python)  |
    +-----------+
          |
          +-------------------+-------------------+
                              |
                              v
+-------------------------------------------------------------+
|                  Prism Orchestration Pattern                 |
|  - Collects results from all agents                          |
|  - Calculates consensus confidence                           |
|  - Counts findings by severity                               |
|  - Synthesizes into structured review                        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                      Review Output                           |
|  {                                                           |
|    "summary": "4 agents found 34 issue(s)...",              |
|    "recommendation": "block" | "request_changes" | "approve"|
|    "consensus": { "level": "strong", "confidence": 0.91 }   |
|    "agentResults": [...],                                   |
|    "severityCounts": { "critical": 2, "high": 11, ... }     |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Language | Port | Capability | What It Analyzes |
|-------|----------|------|------------|------------------|
| Security Agent | Python | 50100 | `security` | Vulnerabilities, injection risks, hardcoded secrets |
| Style Agent | TypeScript | 50101 | `style` | Code quality, naming, complexity |
| Docs Agent | TypeScript | 50102 | `documentation` | Comments, docstrings, clarity |
| Test Agent | Python | 50103 | `testing` | Test coverage indicators, testability |

## Prerequisites

- Docker (for etcd and PostgreSQL)
- Python 3.10+ with dependencies: `pip install grpcio grpcio-tools protobuf google-generativeai`
- Node.js 18+ / pnpm
- `GEMINI_API_KEY` environment variable set (optional - agents have pattern-based fallback)

## Running the Demo

### 1. Start Infrastructure (from repo root)

```bash
# Start etcd and PostgreSQL containers
docker-compose up -d

# Verify containers are running
docker ps | grep parallax
```

### 2. Start Control Plane

```bash
# Terminal 1
cd packages/control-plane
pnpm dev
```

Wait for: `Control Plane HTTP listening on port 8080`

### 3. Start Agents (4 terminals)

```bash
# Terminal 2 - Security Agent (Python)
cd demos/pr-review-bot/agents/security-agent
python agent.py

# Terminal 3 - Style Agent (TypeScript)
cd demos/pr-review-bot/agents/style-agent
pnpm tsx agent.ts

# Terminal 4 - Docs Agent (TypeScript)
cd demos/pr-review-bot/agents/docs-agent
pnpm tsx agent.ts

# Terminal 5 - Test Agent (Python)
cd demos/pr-review-bot/agents/test-agent
python agent.py
```

Wait for all agents to show: `Agent registered with control plane`

### 4. Run the Review

```bash
# Terminal 6
cd demos/pr-review-bot
pnpm review:sample
```

## Example Output

```
Reviewing: examples/sample-code.ts

Submitting code for review...

Execution started: 55b13b9d-5e2b-406a-a9ed-ccf31e292331
Waiting for agents to analyze...

......

════════════════════════════════════════════════════════════
                    CODE REVIEW RESULTS
════════════════════════════════════════════════════════════

Summary: 4 agents found 34 issue(s). Critical: 2, High: 11, Medium: 14, Low: 7

Recommendation: BLOCK
Overall Severity: critical
Consensus: strong (confidence: 91%)
Agents: 4 participated

Agent Results:
────────────────────────────────────────────────────────────
  Documentation Analyzer
    Confidence: 85%
    Findings: 7
    The code has several documentation gaps...

  Security Analyzer
    Confidence: 95%
    Findings: 7
    The code contains SQL injection vulnerabilities...

  Code Style Analyzer
    Confidence: 95%
    Findings: 12
    The code exhibits several issues...

  Test Assessment Analyzer
    Confidence: 90%
    Findings: 8
    The code has several testability issues...

Findings (34):
────────────────────────────────────────────────────────────

  [CRITICAL] SQL injection vulnerability
    Agent: Security Analyzer
    Location: 6
    Suggestion: Use parameterized queries or prepared statements...
    Confidence: 95%

  [HIGH] Hardcoded API key
    Agent: Security Analyzer
    Location: 11
    Suggestion: Store in environment variables...
    Confidence: 95%

  ... (32 more findings)

════════════════════════════════════════════════════════════
```

## The Prism Pattern

The orchestration logic lives in `patterns/code-review.prism`. Key features:

```prism
// Collect results from all agents
results = agentResults

// Filter to successful results
validResults = results.filter(r => r.confidence > 0)

// Calculate consensus confidence
avgConfidence = confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length

// Count findings by severity
criticalCount = validResults.reduce((sum, r) => {
  findings = r.result && r.result.findings ? r.result.findings : []
  count = findings.filter(f => f.severity == "critical").length
  sum + count
}, 0)

// Decision logic based on findings and confidence
if (hasCritical && avgConfidence > 0.7) {
  recommendation = "block"
} else if (hasHigh) {
  recommendation = "request_changes"
} else if (avgConfidence < 0.6 && findingCount > 0) {
  recommendation = "discuss"  // Low confidence - needs human review
} else if (findingCount > 0) {
  recommendation = "approve_with_comments"
}

// Return with confidence annotation
output ~> avgConfidence
```

## Troubleshooting

### Agents not registering
- Ensure etcd is running: `docker ps | grep etcd`
- Check control plane logs for `Service registered`

### Pattern execution errors
- Prism only supports `map`, `filter`, `reduce` for arrays
- Keywords `high`, `medium`, `low`, `critical` must be quoted as property names
- No spread operator (`...`) or `concat` - use reduce patterns instead

### Missing Gemini API key
- Agents fall back to pattern-based analysis (less accurate but functional)
- Set `GEMINI_API_KEY` environment variable for full LLM analysis

## Technical Notes

### Prism Language Limitations
During testing, we discovered Prism's array support is limited:
- Supported: `map()`, `filter()`, `reduce()`
- NOT supported: `concat()`, `some()`, `forEach()`, spread operator
- Reserved keywords: `high`, `medium`, `low`, `critical` (confidence levels)

### ConfidenceValue Unwrapping
Prism's `~>` operator wraps values in `ConfidenceValue` objects. The control plane's runtime manager handles unwrapping these to plain JavaScript objects.

## Why This Matters

This demo shows that Parallax enables:

1. **Teams to build AI capabilities independently** - Security team maintains Python agent, frontend team maintains TypeScript agents
2. **Coordination without coupling** - Agents don't know about each other, the pattern coordinates them
3. **Honest uncertainty** - Confidence flows through the system, low-confidence results are flagged
4. **Declarative orchestration** - The "what" (review code, synthesize findings) is separate from the "how" (gRPC, service discovery)

This is the "Kubernetes for AI agents" vision made concrete.
