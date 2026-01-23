# Orchestration Patterns Guide

> **Building Complex AI Workflows from Simple Primitives**

Parallax provides 40 atomic primitives across 14 categories that combine into sophisticated orchestration patterns. This guide covers the fundamental flow types and their real-world applications.

## Table of Contents

1. [Primitives Overview](#primitives-overview)
2. [Fundamental Flow Types](#fundamental-flow-types)
3. [Composition Examples](#composition-examples)
4. [Pattern Selection Guide](#pattern-selection-guide)
5. [Confidence Propagation](#confidence-propagation)

---

## Primitives Overview

### Categories and Primitives

| Category | Primitives | Purpose |
|----------|------------|---------|
| **Execution** | `parallel`, `sequential`, `batch`, `race` | Control how agents run |
| **Aggregation** | `consensus`, `merge`, `reduce`, `voting` | Combine multiple results |
| **Control** | `retry`, `fallback`, `escalate`, `timeout`, `circuit` | Handle failures and edge cases |
| **Coordination** | `quorum`, `delegate`, `synchronize`, `prioritize` | Coordinate multiple agents |
| **Transformation** | `map`, `partition`, `sample` | Transform data between stages |
| **Workflow** | `dependency`, `pipeline`, `plan` | Structure multi-step processes |
| **Transaction** | `saga` | Distributed transactions with compensation |
| **Integration** | `cache`, `pool`, `stream`, `pubsub` | Connect to external systems |
| **Temporal** | `schedule` | Time-based orchestration |
| **Confidence** | `threshold`, `transform` | Manage uncertainty |

### Key Properties

Every primitive:
- **Propagates confidence** - uncertainty flows through the entire pattern
- **Is composable** - primitives can be nested and combined
- **Is domain-agnostic** - works across any use case
- **Has clear semantics** - predictable behavior in all conditions

---

## Fundamental Flow Types

### 1. Scatter-Gather (Fan-Out/Fan-In)

**What it does:** Distribute work to multiple agents in parallel, then combine their results.

**Primitives:** `parallel` + `merge` | `reduce` | `consensus`

**When to use:**
- You need multiple perspectives on the same input
- Speed matters and tasks are independent
- You want redundancy for reliability

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Multi-model inference | Query GPT-4, Claude, Gemini simultaneously, merge results |
| Document analysis | Extract entities, sentiment, summary in parallel |
| Price comparison | Query multiple vendor APIs, find best price |
| A/B prompt testing | Test multiple prompts, compare performance |
| Code review | Security, style, performance checks in parallel |

**Example YAML:**
```yaml
name: MultiModelAnalysis
description: Analyze with multiple models and merge results
input:
  query: string
agents:
  capabilities: [analysis]
  min: 3
output:
  results: $validResults
  merged: $avgConfidence
confidence: average
```

---

### 2. Voting/Consensus

**What it does:** Multiple agents vote or reach agreement on a decision.

**Primitives:** `voting` + `consensus` + `quorum`

**When to use:**
- Decisions require high confidence
- No single agent is authoritative
- You need democratic agreement

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Content moderation | 3-of-5 models must agree content is safe |
| Medical diagnosis | Multiple specialist agents must concur |
| Fact verification | Cross-reference claims with multiple sources |
| Translation quality | Majority agreement on translation accuracy |
| Fraud detection | Consensus among behavioral, pattern, anomaly detectors |

**Example YAML:**
```yaml
name: ContentModeration
description: Consensus-based content safety check
input:
  content: string
agents:
  capabilities: [moderation, safety]
  min: 5
aggregation:
  strategy: consensus
  threshold: 0.8
  minVotes: 3
output:
  safe: $validResults
  decision: $consensus
confidence: min
```

---

### 3. Pipeline (Sequential Processing)

**What it does:** Process data through multiple stages, where each stage's output feeds the next.

**Primitives:** `sequential` + `pipeline` + `dependency`

**When to use:**
- Stages have dependencies
- Output of one stage is input to the next
- Order matters

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| RAG pipeline | Retrieve → Rank → Generate → Validate |
| Content creation | Outline → Draft → Edit → Fact-check |
| Data processing | Extract → Transform → Validate → Load |
| Customer onboarding | Verify → Assess → Approve → Provision |
| Code generation | Spec → Generate → Test → Review |

**Example YAML:**
```yaml
name: ContentPipeline
description: Multi-stage content creation
input:
  topic: string
  style: string
steps:
  - name: outline
    agents:
      capabilities: [planning]
    output:
      structure: $result
  - name: draft
    input: $steps.outline.output
    agents:
      capabilities: [writing]
    output:
      content: $result
  - name: edit
    input: $steps.draft.output
    agents:
      capabilities: [editing]
output:
  final: $steps.edit.output
confidence: min
```

---

### 4. Hierarchical Delegation

**What it does:** Manager agents break down work and delegate to specialized workers.

**Primitives:** `delegate` + `prioritize` + `escalate`

**When to use:**
- Tasks can be decomposed
- Specialists are better than generalists
- You need tiered handling

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Customer support | Tier 1 → Tier 2 → Human escalation |
| Task decomposition | Manager breaks work into subtasks for workers |
| Research orchestration | Lead researcher delegates to specialists |
| PR review | Junior review → Senior review → Architect approval |
| Incident response | Auto-remediation → On-call → Incident commander |

**Example YAML:**
```yaml
name: SupportTriage
description: Tiered customer support with escalation
input:
  ticket: object
agents:
  capabilities: [support, triage]
  min: 2
groups:
  tier1:
    match: result.complexity == "simple"
  tier2:
    match: result.complexity == "complex"
  escalate:
    match: result.needsHuman == true
output:
  resolution: $tier1.result
  escalated: $escalate.result
confidence: average
fallback:
  condition: confidence < 0.6
  action: escalate
  target: human_agent
```

---

### 5. Quality Gating

**What it does:** Only allow results that meet quality thresholds to proceed.

**Primitives:** `threshold` + `transform` + `circuit`

**When to use:**
- Quality is non-negotiable
- You need to filter unreliable outputs
- Downstream systems require guarantees

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| RAG quality gate | Only return responses with >0.8 groundedness |
| Hallucination filter | Block responses below confidence threshold |
| Safety filter | Pass content through safety checks before release |
| Accuracy gate | Verify calculations meet precision requirements |
| Compliance check | Ensure outputs meet regulatory requirements |

**Example YAML:**
```yaml
name: RAGQualityGate
description: Validate RAG responses before returning
input:
  query: string
  response: string
  context: string
agents:
  capabilities: [validation, quality]
  min: 3
groups:
  groundedness:
    match: result.checkType == "groundedness"
  relevance:
    match: result.checkType == "relevance"
  completeness:
    match: result.checkType == "completeness"
output:
  passed: $avgConfidence
  checks:
    groundedness: $groundedness.result
    relevance: $relevance.result
    completeness: $completeness.result
confidence: min
fallback:
  condition: confidence < 0.7
  action: default
  value:
    passed: false
    reason: "Quality threshold not met"
```

---

### 6. Competitive Racing

**What it does:** Multiple agents race; first valid response wins.

**Primitives:** `race` + `timeout`

**When to use:**
- Latency is critical
- Multiple paths can solve the problem
- You want redundancy without waiting

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Latency optimization | Use first model to respond |
| Cost optimization | Try cheap model first, race expensive if slow |
| Redundancy | Multiple paths, first success wins |
| Search | Query multiple search engines, return fastest |
| Availability | Failover to backup if primary times out |

**Example YAML:**
```yaml
name: FastestResponse
description: Race multiple models for lowest latency
input:
  query: string
agents:
  capabilities: [inference]
  min: 3
aggregation:
  strategy: best
  by: confidence
output:
  result: $validResults
  latency: $metadata.duration
confidence: max
```

---

### 7. Fault Tolerant (Saga)

**What it does:** Handle failures gracefully with retries, fallbacks, and compensation.

**Primitives:** `retry` + `fallback` + `saga` + `circuit`

**When to use:**
- Failures are expected
- Operations need compensation on failure
- You need resilience

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Booking system | Book flight → hotel → car, compensate on failure |
| Payment processing | Retry with backoff, fallback to alternate processor |
| Data sync | Distributed updates with rollback capability |
| API resilience | Circuit breaker prevents cascade failures |
| Multi-step workflows | Compensation logic for partial failures |

**Example YAML:**
```yaml
name: ResilientBooking
description: Multi-step booking with compensation
input:
  booking: object
agents:
  capabilities: [booking, transaction]
  min: 3
groups:
  flight:
    match: result.bookingType == "flight"
  hotel:
    match: result.bookingType == "hotel"
  car:
    match: result.bookingType == "car"
output:
  confirmation:
    flight: $flight.result
    hotel: $hotel.result
    car: $car.result
confidence: min
fallback:
  condition: confidence < 0.5
  action: escalate
  target: manual_booking
```

---

### 8. MapReduce (Partitioned Processing)

**What it does:** Split large inputs, process partitions in parallel, reduce to final result.

**Primitives:** `partition` + `parallel` + `reduce`

**When to use:**
- Input is too large for single agent
- Work is embarrassingly parallel
- You need to aggregate partial results

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Large document analysis | Split by section, analyze in parallel, merge |
| Batch processing | Partition dataset, process chunks, aggregate |
| Search indexing | Partition corpus, index in parallel, merge indices |
| Log analysis | Split by time window, analyze, summarize |
| Report generation | Generate sections in parallel, combine |

**Example YAML:**
```yaml
name: LargeDocumentAnalysis
description: Analyze large documents by section
input:
  document: string
  sections: array
agents:
  capabilities: [analysis, document]
  min: 4
groups:
  summary:
    match: result.section == "summary"
    take: all
  analysis:
    match: result.section == "body"
    take: all
aggregation:
  strategy: merge
  fields: [findings, recommendations, risks]
output:
  combined:
    summaries: $summary.result
    analyses: $analysis.result
confidence: average
```

---

### 9. Event-Driven/Reactive

**What it does:** React to events, streams, or scheduled triggers.

**Primitives:** `pubsub` + `stream` + `schedule`

**When to use:**
- Processing is triggered by external events
- Data arrives continuously
- You need scheduled automation

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| Real-time monitoring | Subscribe to alerts, trigger analysis |
| Scheduled reports | Daily/weekly automated analysis |
| Streaming ETL | Process data as it arrives |
| Notification system | Publish results to interested subscribers |
| Continuous integration | Trigger on code changes |

---

### 10. Resource Management

**What it does:** Efficiently manage shared resources like connections, caches, and rate limits.

**Primitives:** `pool` + `batch` + `cache`

**When to use:**
- API rate limits exist
- Resources are expensive
- Results can be reused

**Real-World Use Cases:**

| Use Case | Description |
|----------|-------------|
| API rate limiting | Pool connections, batch requests |
| Model serving | Connection pool to model endpoints |
| Result caching | Cache expensive computations |
| Batch inference | Collect requests, process in batches |
| Cost optimization | Reuse results, minimize API calls |

---

## Composition Examples

Complex patterns emerge from combining fundamental flow types:

### Robust Consensus
**Flow:** Scatter-Gather → Voting → Quality Gate → Fallback

**Primitives:** `parallel` → `consensus` → `threshold` → `fallback` → `escalate`

**Use Case:** Medical diagnosis that requires high confidence with human backup

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Parallel   │────▶│  Consensus  │────▶│  Threshold  │────▶│  Escalate   │
│  Analysis   │     │   Voting    │     │    Gate     │     │  to Human   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   3+ agents          Agreement?         Conf > 0.9?         If gate fails
```

---

### Adaptive Pipeline
**Flow:** Pipeline → Quality Gate → Retry → Cache

**Primitives:** `pipeline` → `circuit` → `retry` → `cache`

**Use Case:** Resilient data processing with caching

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Pipeline   │────▶│   Circuit   │────▶│    Retry    │────▶│    Cache    │
│   Stages    │     │   Breaker   │     │  w/ Backoff │     │   Results   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   Multi-stage       Fail fast          Transient err       Reuse success
```

---

### Multi-Stage Voting
**Flow:** MapReduce → Voting → Quality Gate → Merge

**Primitives:** `partition` → `parallel` → `voting` → `threshold` → `merge`

**Use Case:** Large-scale content moderation

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Partition  │────▶│  Parallel   │────▶│   Voting    │────▶│    Merge    │
│   Content   │     │   Review    │     │  per Chunk  │     │   Results   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   Split large        N reviewers       Majority vote        Final decision
```

---

### Hierarchical MapReduce
**Flow:** Delegation → MapReduce → Consensus

**Primitives:** `delegate` → `partition` → `parallel` → `reduce` → `consensus`

**Use Case:** Enterprise document analysis with specialist teams

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Manager    │────▶│  Partition  │────▶│  Parallel   │────▶│  Consensus  │
│  Delegate   │     │   by Type   │     │  Specialists│     │   Summary   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   Assign work       Legal/Finance      Domain experts      Executive view
```

---

### Temporal Quality Gate
**Flow:** Schedule → Pipeline → Quality Gate → Event

**Primitives:** `schedule` → `pipeline` → `threshold` → `pubsub`

**Use Case:** Scheduled compliance checking with alerts

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Schedule   │────▶│  Pipeline   │────▶│  Threshold  │────▶│   Publish   │
│   Daily     │     │   Checks    │     │    Gate     │     │   Alerts    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   Cron trigger      Run analysis       Flag issues         Notify team
```

---

## Pattern Selection Guide

### Decision Tree

```
What's your primary need?
│
├─▶ Multiple perspectives on same input?
│   └─▶ Scatter-Gather (#1)
│
├─▶ Democratic decision-making?
│   └─▶ Voting/Consensus (#2)
│
├─▶ Multi-stage processing with dependencies?
│   └─▶ Pipeline (#3)
│
├─▶ Break down complex tasks?
│   └─▶ Hierarchical Delegation (#4)
│
├─▶ Ensure quality thresholds?
│   └─▶ Quality Gating (#5)
│
├─▶ Minimize latency?
│   └─▶ Competitive Racing (#6)
│
├─▶ Handle failures gracefully?
│   └─▶ Fault Tolerant (#7)
│
├─▶ Process large datasets?
│   └─▶ MapReduce (#8)
│
├─▶ React to events or schedules?
│   └─▶ Event-Driven (#9)
│
└─▶ Optimize resource usage?
    └─▶ Resource Management (#10)
```

### Quick Reference

| I need... | Use this pattern | Key primitives |
|-----------|------------------|----------------|
| Multiple opinions | Scatter-Gather | `parallel`, `merge` |
| Agreement/voting | Consensus | `voting`, `quorum` |
| Step-by-step | Pipeline | `sequential`, `pipeline` |
| Task breakdown | Delegation | `delegate`, `prioritize` |
| Quality control | Quality Gate | `threshold`, `circuit` |
| Speed | Racing | `race`, `timeout` |
| Reliability | Fault Tolerant | `retry`, `fallback`, `saga` |
| Large data | MapReduce | `partition`, `reduce` |
| Automation | Event-Driven | `schedule`, `pubsub` |
| Efficiency | Resource Mgmt | `cache`, `pool`, `batch` |

---

## Confidence Propagation

Every pattern propagates confidence through its stages:

### Propagation Rules

| Pattern | Confidence Strategy |
|---------|---------------------|
| Scatter-Gather | Average, min, max, or weighted |
| Voting/Consensus | Based on agreement level |
| Pipeline | Minimum (weakest link) |
| Quality Gate | Pass/fail threshold |
| Racing | Winner's confidence |
| MapReduce | Aggregated from partitions |

### Example: Confidence Flow

```
Input (1.0) ──▶ Agent A (0.9) ──┐
                                ├──▶ Merge (avg: 0.85) ──▶ Threshold (>0.8?) ──▶ Output (0.85)
Input (1.0) ──▶ Agent B (0.8) ──┘
```

---

## Summary

From **40 primitives** across **14 categories**:

- **10 fundamental orchestration types**
- **50+ common compound patterns**
- **Hundreds of domain-specific variations**

The visual pattern builder exposes these 10 flow types as templates, with primitive-level customization for advanced users.
