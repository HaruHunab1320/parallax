# RAG Quality Gate Demo

A quality assurance pipeline for RAG (Retrieval-Augmented Generation) responses that checks for hallucinations, relevance, and completeness before returning answers to users.

## What This Demo Proves

1. **Hallucination detection** - Catches when the model makes up information not in the sources
2. **Relevance verification** - Ensures the answer actually addresses the question
3. **Completeness checking** - Verifies all parts of the question are answered
4. **Parallel quality checks** - All 3 agents run simultaneously for fast validation

## Architecture

```
RAG Pipeline Output:
  Question + Answer + Sources
              ↓
+-------------------------------------------------------------+
|                      Control Plane                           |
|                (Prism Quality Gate Pattern)                  |
+-------------------------------------------------------------+
              ↓
    +---------+---------+---------+
    ↓         ↓         ↓
┌─────────┐ ┌─────────┐ ┌─────────┐
│Grounded-│ │Relevance│ │Complete-│
│  ness   │ │ Checker │ │  ness   │
│ Checker │ │         │ │ Checker │
└────┬────┘ └────┬────┘ └────┬────┘
     └───────────┼───────────┘
                 ↓
+-------------------------------------------------------------+
|                    Quality Gate Result                       |
|  {                                                           |
|    "status": "approved" | "needs_review" | "rejected",       |
|    "scores": { groundedness, relevance, completeness },      |
|    "recommendation": "Return to user" | "Flag for review"   |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Check | Port | Catches |
|-------|-------|------|---------|
| Groundedness Checker | Factual accuracy | 50400 | Hallucinations, made-up facts |
| Relevance Checker | Topic alignment | 50401 | Off-topic responses, misunderstandings |
| Completeness Checker | Answer coverage | 50402 | Partial answers, missing information |

## Quality Gate Outcomes

| Status | Meaning | Action |
|--------|---------|--------|
| **approved** | All checks pass | Return answer to user |
| **needs_review** | Some checks fail | Flag for human review |
| **rejected** | Multiple failures | Regenerate with better retrieval |

## Prerequisites

- Docker (for etcd and PostgreSQL)
- Node.js 18+ / pnpm
- `GEMINI_API_KEY` environment variable set

## Running the Demo

### 1. Start Infrastructure (from repo root)

```bash
docker-compose up -d
```

### 2. Start Control Plane

```bash
# Terminal 1
cd packages/control-plane
pnpm dev
```

Wait for: `Control Plane HTTP listening on port 8080`

### 3. Start Quality Gate Agents (3 terminals)

```bash
# Terminal 2 - Groundedness Checker
cd demos/rag-quality-gate
pnpm agent:groundedness

# Terminal 3 - Relevance Checker
cd demos/rag-quality-gate
pnpm agent:relevance

# Terminal 4 - Completeness Checker
cd demos/rag-quality-gate
pnpm agent:completeness
```

### 4. Run Quality Checks

```bash
# Terminal 5
cd demos/rag-quality-gate

# Test a good response (should pass)
pnpm check examples/good-response.json

# Test a hallucinated response (should fail groundedness)
pnpm check examples/hallucinated-response.json

# Test an incomplete response (should fail completeness)
pnpm check examples/incomplete-response.json
```

## Example Output

### Good Response (All Checks Pass)
```
══════════════════════════════════════════════════════════════════════
                    RAG QUALITY GATE RESULTS
══════════════════════════════════════════════════════════════════════

Question: "What are the main features of Parallax?"

Status: ✅ APPROVED
Overall Score: 95%
Checks: 3/3 passed

All quality checks passed - answer is grounded, relevant, and complete

──────────────────────────────────────────────────────────────────────
  QUALITY CHECKS
──────────────────────────────────────────────────────────────────────

  ✅ GROUNDEDNESS: 95%
     All claims are grounded in sources

  ✅ RELEVANCE: 98%
     Answer is on-topic and relevant

  ✅ COMPLETENESS: 92%
     All parts of the question are addressed

──────────────────────────────────────────────────────────────────────
  RECOMMENDATION
──────────────────────────────────────────────────────────────────────
  Return answer to user

══════════════════════════════════════════════════════════════════════
```

### Hallucinated Response (Groundedness Fails)
```
Status: ❌ REJECTED
Overall Score: 45%
Checks: 1/3 passed

  ❌ GROUNDEDNESS: 30%
     Hallucinations found:
       - "Built-in machine learning models" - not in sources
       - "GPT-4 and Claude models without API keys" - fabricated
       - "Kubernetes auto-scaling to millions of requests" - not mentioned
       - "GraphQL API" - actually uses gRPC per sources
       - "Free enterprise tier" - not stated in sources

  RECOMMENDATION
  Regenerate answer with improved retrieval
```

## The Prism Pattern

The quality gate logic lives in `patterns/quality-gate.prism`:

```prism
// Collect results from all quality check agents
results = agentResults

// Get individual check results
groundednessPassed = groundednessCheck ? groundednessCheck.result.passed : false
relevancePassed = relevanceCheck ? relevanceCheck.result.passed : false
completenessPassed = completenessCheck ? completenessCheck.result.passed : false

// Calculate overall pass (all must pass)
allPassed = groundednessPassed && relevancePassed && completenessPassed

// Determine status
status = allPassed ? "approved"
  : failedChecks == totalChecks ? "rejected"
  : "needs_review"

output ~> avgScore
```

## Why This Matters

This demo shows that Parallax enables:

1. **Defense against hallucinations** - Don't let AI make up facts
2. **Multi-dimensional quality** - Check multiple aspects in parallel
3. **Actionable recommendations** - Clear guidance on what to do with each response
4. **Transparent reasoning** - See exactly why a response passed or failed

Use cases:
- **Customer support chatbots** - Ensure accurate answers
- **Documentation Q&A** - Catch outdated or wrong information
- **Legal/medical AI** - Critical domains where accuracy matters
- **Enterprise search** - Validate AI-generated summaries
