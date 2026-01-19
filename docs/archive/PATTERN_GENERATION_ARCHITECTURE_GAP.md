# Pattern Generation Architecture Gap Analysis

## Overview

This document captures the architectural gap discovered during the evolution from static pattern files to dynamic pattern generation using primitives.

## The Evolution

### Original Architecture (Static Patterns)
- Pre-written patterns stored in `/patterns` directory (e.g., `consensus-builder.prism`)
- Users select which pattern to use by name
- Pattern Engine loads the .prism file and executes it
- Limited flexibility - need new files for variations

### New Architecture Goal (Dynamic Pattern Generation)
- No pre-written patterns needed
- Patterns generated on-demand from primitives
- Users express needs as `OrchestrationRequirements`
- Pattern Composer Agent generates custom patterns
- More flexible and powerful

## The Architectural Gap

### What We Have
1. **Pattern Composer Agent** - Can generate .prism code from primitives
2. **Pattern Engine** - Loads .prism files and executes them
3. **Primitives** - Building blocks in `/packages/primitives`
4. **OrchestrationRequirements** - Interface for expressing needs

### What's Missing
The bridge between requirements and execution. Specifically:

1. **API Layer**: How do OrchestrationRequirements get into the system?
2. **Pattern Composer Invocation**: How is the Pattern Composer Agent itself orchestrated?
3. **Pattern Injection**: How do generated patterns get into the Pattern Engine?
4. **Execution Flow**: What triggers the end-to-end process?

## Real-World Example Comparison

### Scenario: "Analyze a pull request for security, quality, and performance"

#### Old System Flow
```bash
# User picks a pattern
parallax run consensus-builder --input '{"task": "Review PR #123"}'

# Flow:
API → Pattern Engine → Load consensus-builder.prism → Execute → Result
```

#### New System Flow (Intended)
```json
// User expresses requirements
POST /api/orchestrate
{
  "goal": "Analyze PR for security, quality, and performance with high confidence consensus",
  "strategy": "multi-perspective-consensus",
  "minConfidence": 0.9,
  "fallback": "escalate to senior architect",
  "context": {
    "perspectives": ["security", "code-quality", "performance"],
    "requireAllPerspectives": true
  }
}

// Flow:
API → ??? → Pattern Composer → Generate Pattern → ??? → Pattern Engine → Execute → Result
```

## The Chicken-and-Egg Problem

The Pattern Composer is itself an agent that needs orchestration. So:
- To orchestrate agents, you need a pattern
- To get a pattern, you need the Pattern Composer
- To orchestrate the Pattern Composer, you need... a pattern?

## Possible Solutions

### 1. Bootstrap Pattern
Have ONE static pattern that orchestrates the Pattern Composer:
```prism
// bootstrap-composer.prism
result = patternComposer.analyze(requirements)
generatedPattern = result.value.pattern
// Then somehow execute generatedPattern...
```

### 2. Two-Phase Execution
- Phase 1: Direct call to Pattern Composer (not through Pattern Engine)
- Phase 2: Execute the generated pattern normally

### 3. Built-in Orchestration API
Add a new API endpoint that handles the full flow:
```
POST /api/orchestrate
- Invokes Pattern Composer directly
- Saves generated pattern temporarily
- Executes pattern
- Returns results
```

### 4. Pattern Composer as Core Service
Instead of being an agent, Pattern Composer becomes part of the control plane.

## Key Architectural Questions

1. **Pattern Storage**: Should generated patterns be:
   - Ephemeral (in-memory only)?
   - Temporarily saved to disk?
   - Stored in database?
   - Cached for reuse?

2. **Pattern Identification**: How are generated patterns named/identified?
   - UUID-based names?
   - Hash of requirements?
   - User-provided names?

3. **Pattern Lifecycle**: 
   - When are generated patterns cleaned up?
   - Can they be reused across requests?
   - Should they be versioned?

4. **API Design**: What's the interface for orchestration requests?
   - Single endpoint that does everything?
   - Separate endpoints for generation and execution?
   - Async pattern with job IDs?

## The Missing Conceptual Layer

We may be missing a layer that:
1. Accepts `OrchestrationRequirements`
2. Manages the pattern generation process
3. Handles pattern storage/retrieval
4. Coordinates execution

This could be:
- A new service in the control plane
- An extension to the Pattern Engine
- A higher-level orchestration API

## Next Steps

1. Decide on the architectural approach for bridging requirements to execution
2. Determine if Pattern Composer should remain an agent or become a service
3. Design the API for orchestration requests
4. Implement the missing layer
5. Test with real-world scenarios

## Lessons Learned

1. **Parallax IS orchestration** - Not about detecting when orchestration is needed
2. **Patterns are the orchestration language** - .prism files are like YAML for coordination
3. **The evolution to dynamic patterns created a gap** - Need to bridge requirements to execution
4. **Bootstrap problem** - Orchestrating the orchestrator requires special handling

## References

- Original patterns: `/patterns/*.prism`
- Primitives: `/packages/primitives/**/*.prism`
- Types: `/packages/primitives/types.ts` (OrchestrationRequirements)
- Pattern Engine: `/packages/control-plane/src/pattern-engine/`
- Meta-agents: `/packages/meta-agents/` (PatternAwareWrapper, PatternComposerAgent)
