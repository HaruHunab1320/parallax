# Multi-Model Voting Demo

A consensus-based decision system that uses multiple AI models to vote on questions, demonstrating Parallax's ability to coordinate agents and synthesize results with confidence awareness.

## What This Demo Proves

1. **Multi-model consensus** - Different models can agree or disagree, and we detect which
2. **Confidence-aware routing** - Unanimous agreement = high confidence, split = flag for human review
3. **Model diversity** - Same provider, different model architectures provide different perspectives
4. **Practical use case** - Content moderation, fraud detection, triage all benefit from multiple opinions

## Architecture

```
                         Question + Options
                                |
                                v
+-------------------------------------------------------------+
|                      Control Plane                           |
|                   (Prism Voting Pattern)                     |
+-------------------------------------------------------------+
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
    +-----------+         +-----------+         +-----------+
    | Gemini    |         | Gemini    |         | Gemini    |
    | 2.0 Flash |         | 1.5 Pro   |         | 1.5 Flash |
    +-----------+         +-----------+         +-----------+
          |                     |                     |
          +---------------------+---------------------+
                                |
                                v
+-------------------------------------------------------------+
|                      Voting Output                           |
|  {                                                           |
|    "decision": "appropriate",                                |
|    "consensus": { "type": "unanimous", "confidence": 0.92 }, |
|    "needsHumanReview": false,                                |
|    "votes": [...]                                            |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Model | Port | Characteristics |
|-------|-------|------|-----------------|
| Flash 2 Voter | gemini-2.0-flash | 50200 | Fast, balanced reasoning |
| Pro Voter | gemini-3-pro-preview | 50201 | Most capable, detailed reasoning |
| Flash Voter | gemini-3-flash-preview | 50202 | Fast, efficient |

## Consensus Levels

| Type | Meaning | Action |
|------|---------|--------|
| **Unanimous** | All models agree | Auto-approve with high confidence |
| **Majority** | 2/3 models agree | Approve with moderate confidence |
| **Split** | No clear winner | Flag for human review |

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

### 3. Start Voting Agents (3 terminals)

```bash
# Terminal 2 - Gemini 2.0 Flash
cd demos/multi-model-voting
pnpm agent:flash2

# Terminal 3 - Gemini 1.5 Pro
cd demos/multi-model-voting
pnpm agent:pro

# Terminal 4 - Gemini 1.5 Flash
cd demos/multi-model-voting
pnpm agent:flash
```

### 4. Run a Vote

```bash
# Terminal 5
cd demos/multi-model-voting

# Simple yes/no question
pnpm vote "Is this a good idea?"

# Using a config file
pnpm vote examples/content-moderation.json

# Custom options
pnpm vote --question "What severity?" --options "low,medium,high,critical"
```

## Example Scenarios

### Content Moderation
```bash
pnpm vote examples/content-moderation.json
```
Asks 3 models if user-generated content is appropriate.

### Fraud Detection
```bash
pnpm vote examples/fraud-detection.json
```
Asks 3 models if a transaction looks fraudulent.

### Support Ticket Priority
```bash
pnpm vote examples/support-priority.json
```
Asks 3 models to classify support ticket urgency.

## Example Output

```
════════════════════════════════════════════════════════════
                    VOTING RESULTS
════════════════════════════════════════════════════════════

Question: Is this content appropriate for a general audience?

Decision: APPROPRIATE
Consensus: ✅ UNANIMOUS
Confidence: 92%
Votes: 3/3 for winner

3 models voted unanimously for: appropriate

Individual Votes:
────────────────────────────────────────────────────────────

  Gemini 2.0 Flash Voter (gemini-2.0-flash)
    Vote: appropriate
    Confidence: 90%
    The content describes a hiking experience with no inappropriate elements...

  Gemini 1.5 Pro Voter (gemini-1.5-pro)
    Vote: appropriate
    Confidence: 95%
    This is wholesome outdoor recreation content suitable for all ages...

  Gemini 1.5 Flash Voter (gemini-1.5-flash)
    Vote: appropriate
    Confidence: 92%
    Nature photography and hiking content is family-friendly...

════════════════════════════════════════════════════════════
```

## The Prism Pattern

The voting logic lives in `patterns/voting.prism`:

```prism
// Collect votes from all agents
results = agentResults
validResults = results.filter(r => r.confidence > 0 && r.result && r.result.decision)

// Check for unanimous agreement
isUnanimous = matchFirst == validResults.length

// Determine consensus type
consensusType = isUnanimous ? "unanimous"
  : hasMajority ? "majority"
  : "split"

// Flag for human review if split or low confidence
needsHumanReview = consensusType == "split" || consensusConfidence < 0.6

output ~> consensusConfidence
```

## Why This Matters

This demo shows that Parallax enables:

1. **Defense in depth** - Multiple models reduce single-point-of-failure in AI decisions
2. **Transparent disagreement** - When models disagree, it's surfaced rather than hidden
3. **Calibrated confidence** - Unanimous agreement is higher confidence than narrow majority
4. **Human-in-the-loop** - Automatic escalation when AI can't reach consensus

Use cases:
- **Content moderation** - Is this post appropriate?
- **Fraud detection** - Is this transaction suspicious?
- **Medical triage** - How urgent is this case?
- **Legal review** - Is this compliant?
- **Quality assurance** - Does this meet standards?
