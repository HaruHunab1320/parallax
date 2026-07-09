---
sidebar_position: 3
title: Org-Chart Pattern Flow
description: How hierarchical team patterns work from YAML to execution
---

# Org-Chart Pattern Flow

Org-chart patterns allow you to define hierarchical teams of AI agents that work together like a software development organization. This document explains how these patterns flow from definition to execution.

## The Pattern Pipeline

```mermaid
flowchart LR
    subgraph Definition["1. Definition"]
        YAML["Org-Chart YAML\n(patterns/org-*.yaml)"]
    end

    subgraph Compilation["2. Compilation"]
        COMPILER[Org-Chart Compiler]
        SPEC[Workflow Spec]
    end

    subgraph Loading["3. Loading"]
        LOADER[Pattern Loader]
        CACHE[Pattern Cache]
    end

    subgraph Execution["4. Execution"]
        ENGINE[Pattern Engine]
        WFE[Workflow Executor]
        THREADS[Managed CLI-Agent Threads]
    end

    YAML --> COMPILER
    COMPILER --> SPEC
    SPEC --> LOADER
    LOADER --> CACHE
    CACHE --> ENGINE
    ENGINE --> WFE
    WFE --> THREADS
```

The org-chart compiler lives **inside the control plane** (`org-patterns/`). It parses the YAML into a workflow spec; the **workflow executor** then runs that spec by spawning and routing managed CLI-agent threads. There is no separate DSL and no compilation to an intermediate script language.

## Step 1: Define the Org-Chart

An org-chart pattern defines roles, their relationships, and a workflow:

```yaml
# patterns/code-review-team.yaml
name: code-review-team
version: "1.0.0"
description: A team that reviews and improves code

structure:
  roles:
    lead:
      name: Tech Lead
      singleton: true
      capabilities: [architecture, code_review, decision_making]

    reviewer:
      name: Code Reviewer
      reportsTo: lead
      minInstances: 2
      maxInstances: 4
      capabilities: [code_review, testing]

    engineer:
      name: Engineer
      reportsTo: lead
      minInstances: 1
      maxInstances: 2
      capabilities: [implementation, refactoring]

workflow:
  name: review-and-fix
  input:
    code: string
    requirements: string

  steps:
    # Lead creates review criteria
    - type: assign
      role: lead
      task: "Create review criteria for: ${input.requirements}"

    # Reviewers analyze in parallel
    - type: parallel
      steps:
        - type: assign
          role: reviewer
          task: "Review code for correctness"
        - type: assign
          role: reviewer
          task: "Review code for performance"

    # Aggregate review feedback
    - type: aggregate
      method: merge

    # Lead makes final decision
    - type: review
      reviewer: lead

    # If issues found, engineer fixes
    - type: condition
      check: "!step_3_result.approved"
      then:
        type: assign
        role: engineer
        task: "Fix issues: ${step_2_result.feedback}"
      else:
        type: assign
        role: lead
        task: "Approve changes"

  output: finalResult
```

## Step 2: Compilation to a Workflow Spec

The org-chart compiler (in the control plane's `org-patterns/`) parses and validates the YAML, then produces an in-memory **workflow spec**: the roles, how agents map to them, and the ordered workflow steps the executor should run.

```mermaid
flowchart TB
    subgraph Input["YAML Structure"]
        ROLES[Roles Definition]
        WORKFLOW[Workflow Steps]
        POLICY[Escalation Policy]
    end

    subgraph Compiler["Org-Chart Compiler"]
        PARSE[Parse YAML]
        VALIDATE[Validate Structure]
        BUILD[Build Workflow Spec]
    end

    subgraph Output["Workflow Spec"]
        RA[Role → Agent Map]
        STEPS[Step Sequence]
        ROUTES[Escalation Routes]
    end

    ROLES --> PARSE
    WORKFLOW --> PARSE
    POLICY --> PARSE
    PARSE --> VALIDATE
    VALIDATE --> BUILD
    BUILD --> RA
    BUILD --> STEPS
    BUILD --> ROUTES
```

The spec is a structured object, not generated source code. Each step (`assign`, `parallel`, `review`, `condition`, …) becomes an instruction the workflow executor interprets at runtime, carrying the per-role escalation policy (`accept` / `retryBelow` / `escalateBelow`) alongside it.

## Step 3: Pattern Loading

The Pattern Loader reads org-chart YAML files from the patterns directory, compiles each to a workflow spec, and caches it by name:

```mermaid
flowchart TB
    subgraph Files["Pattern Files"]
        YAML_FILE["patterns/org-*.yaml"]
    end

    subgraph Loader["Pattern Loader"]
        LOAD[Load YAML]
        COMPILE[Compile to Workflow Spec]
        VALIDATE[Validate Pattern]
        STORE[Store in Cache]
    end

    subgraph Cache["Pattern Cache"]
        MAP[Pattern Map]
    end

    YAML_FILE --> LOAD
    LOAD --> COMPILE
    COMPILE --> VALIDATE
    VALIDATE --> STORE
    STORE --> MAP
```

TypeScript pattern modules follow a different path entirely: they are loaded from the `@parallaxai/patterns` manifest and invoked via `execute(ctx)` (see [Patterns](/docs/concepts/patterns)). This page covers the org-chart YAML path.

## Step 4: Execution

When a pattern executes, the Pattern Engine orchestrates the full flow:

```mermaid
sequenceDiagram
    participant Client
    participant PE as Pattern Engine
    participant WFE as Workflow Executor
    participant WS as Workspace Service
    participant RT as Agent Runtime
    participant Threads as CLI-Agent Threads

    Client->>PE: Execute "code-review-team"

    PE->>PE: Get workflow spec from cache

    alt Workspace enabled
        PE->>WS: Provision workspace
        WS-->>PE: {path, branch, repo}
    end

    PE->>WFE: Run workflow spec

    WFE->>WFE: Select agents by role capabilities

    alt Need more agents
        WFE->>RT: Spawn agents (lead, reviewers, engineers)
        RT->>Threads: Start managed CLI-agent threads
        Threads-->>RT: Ready
        RT-->>WFE: Thread handles
    end

    loop For each workflow step
        WFE->>Threads: Assign task (parallel where specified)
        Threads-->>WFE: Result + confidence
        WFE->>WFE: Apply escalation policy (accept / retry / escalate)
    end

    WFE-->>PE: Final result

    alt Create PR
        PE->>WS: Finalize workspace
        WS-->>PE: PR URL
    end

    PE-->>Client: {result, confidence, prUrl}
```

## Role Capabilities

Agents are matched to roles based on their capabilities:

| Role Type | Typical Capabilities |
|-----------|---------------------|
| Architect | `architecture`, `system_design`, `code_review` |
| Lead | `code_review`, `decision_making`, `mentoring` |
| Engineer | `implementation`, `refactoring`, `debugging` |
| Reviewer | `code_review`, `testing`, `security` |
| QA | `testing`, `automation`, `quality` |
| DevOps | `deployment`, `infrastructure`, `monitoring` |

```yaml
# Agent registration with capabilities
agents:
  - id: claude-architect
    type: claude
    capabilities: [architecture, system_design, code_review]

  - id: claude-engineer-1
    type: claude
    capabilities: [implementation, javascript, typescript]

  - id: aider-reviewer
    type: aider
    capabilities: [code_review, testing, python]
```

## Workflow Step Types

| Step Type | Description | Example |
|-----------|-------------|---------|
| `assign` | Assign task to a role | `{type: assign, role: engineer, task: "Implement feature"}` |
| `parallel` | Execute steps concurrently | `{type: parallel, steps: [...]}` |
| `sequential` | Execute steps in order | `{type: sequential, steps: [...]}` |
| `review` | Role reviews previous output | `{type: review, reviewer: lead}` |
| `approve` | Role approves/rejects | `{type: approve, approver: lead}` |
| `aggregate` | Combine results | `{type: aggregate, method: merge}` |
| `condition` | Conditional branching | `{type: condition, check: "...", then: ..., else: ...}` |
| `select` | Select agent from role | `{type: select, role: engineer, criteria: best}` |

## Aggregation Methods

| Method | Description |
|--------|-------------|
| `consensus` | Most common result wins |
| `majority` | Result with >50% agreement |
| `merge` | Combine all results into one object |
| `best` | Highest confidence result |
| `all` | Return all results as array |

## Best Practices

### 1. Design for Failure

Always have fallback paths:

```yaml
workflow:
  steps:
    - type: assign
      role: primary_engineer
      task: "Implement feature"

    - type: condition
      check: "step_0_result.confidence < 0.7"
      then:
        type: assign
        role: backup_engineer
        task: "Review and improve implementation"
```

### 2. Use Appropriate Parallelism

Parallelize independent tasks:

```yaml
# Good: Independent reviews can run in parallel
- type: parallel
  steps:
    - type: assign
      role: reviewer
      task: "Check security"
    - type: assign
      role: reviewer
      task: "Check performance"
    - type: assign
      role: reviewer
      task: "Check correctness"
```

### 3. Leverage Confidence Scores

Use confidence in conditions:

```yaml
- type: condition
  check: "step_1_result.confidence > 0.9"
  then:
    type: assign
    role: lead
    task: "Quick approval"
  else:
    type: review
    reviewer: lead
```

## Next Steps

- [Data Plane](./data-plane) - How the execution engine works
- [Agent Lifecycle](./agent-lifecycle) - Agent spawning and management
- [Pattern Examples](/docs/patterns/org-chart-patterns) - More org-chart examples
