# The Complete Parallax Picture: What Actually Happens

## What Parallax Is vs What It Isn't

### What Parallax IS:
- **An orchestration layer** that coordinates multiple agents
- **A pattern executor** that runs Prism scripts
- **A confidence aggregator** that combines results intelligently
- **A parallel execution engine** that runs agents simultaneously
- **A decision flow controller** based on confidence levels

### What Parallax IS NOT:
- Not an agent itself
- Not giving recommendations to agents
- Not telling agents how to do their job
- Not modifying agent behavior

## The Complete Flow: Step by Step

### 1. User Makes a Request
```javascript
// User wants to analyze code
const request = {
  task: "Review this codebase for security vulnerabilities",
  code: loadCodebase("./target-app"),
  requirements: "Need high confidence assessment"
};
```

### 2. User Chooses a Coordination Pattern
```javascript
// User selects which pattern to use
const result = await parallax.execute("security-review-pattern", request);
```

### 3. Parallax Loads the Pattern
```prism
// security-review-pattern.prism
/**
 * @name SecurityReviewPattern
 * @minAgents 3
 */

// Get available security agents
agents = parallax.agents.filter(a => 
  a.capabilities.includes("security")
)

// THE KEY PART: Parallax calls agents, not vice versa
results = parallel(agents.map(agent => 
  agent.analyze(input.task, input.code)
))
```

### 4. Parallax Calls Each Agent

Here's what ACTUALLY happens:

```
PARALLAX (Control Plane)
    |
    ├─→ Makes gRPC call to SecurityAgent1
    |   "Hey, analyze this code for security issues"
    |   
    ├─→ Makes gRPC call to SecurityAgent2  
    |   "Hey, analyze this code for security issues"
    |
    └─→ Makes gRPC call to SecurityAgent3
        "Hey, analyze this code for security issues"

All three calls happen AT THE SAME TIME (parallel)
```

### 5. Agents Do Their Individual Work

Each agent independently analyzes the code:

```typescript
// Inside SecurityAgent1
async analyze(task: string, data: any): Promise<[any, number]> {
  // Agent does its own analysis
  const vulnerabilities = this.scanForSQLInjection(data.code);
  
  // Agent decides its own confidence
  const confidence = vulnerabilities.length > 0 ? 0.95 : 0.6;
  
  // Agent returns its own result
  return [{
    found: vulnerabilities,
    severity: "critical",
    recommendation: "Fix SQL injection before deployment"
  }, confidence];
}
```

**Key Point**: The agent doesn't know about:
- Other agents
- The pattern being used
- What Parallax will do with the result

### 6. Parallax Receives All Results

```
SecurityAgent1 returns:
{
  found: ["SQL injection in user.js:45"],
  severity: "critical",
  confidence: 0.95
}

SecurityAgent2 returns:
{
  found: ["XSS in template.js:12"],
  severity: "high",
  confidence: 0.88
}

SecurityAgent3 returns:
{
  found: [],
  severity: "none",
  confidence: 0.6
}
```

### 7. Parallax Executes Pattern Logic

Now the Prism pattern (running in Parallax) processes results:

```prism
// Still in security-review-pattern.prism

// Aggregate results based on confidence
criticalIssues = results.filter(r => 
  r.value.severity == "critical" && r.confidence > 0.8
)

// Make confidence-aware decisions
uncertain if (criticalIssues.length > 0) {
  high {
    // High confidence in critical issues
    finalResult = {
      decision: "BLOCK_DEPLOYMENT",
      reason: "Critical vulnerabilities with high confidence",
      mustFix: criticalIssues,
      confidence: 0.95
    }
  }
  medium {
    // Medium confidence - need human review
    finalResult = {
      decision: "REQUIRES_REVIEW",
      reason: "Potential critical issues detected",
      issues: criticalIssues,
      confidence: 0.7
    }
  }
  low {
    // Low confidence - run more analysis
    additionalResults = deepSecurityScan(input.code)
    finalResult = combineResults(results, additionalResults)
  }
}

// Return aggregated result to user
finalResult ~> overallConfidence
```

### 8. User Gets Coordinated Result

```javascript
// Back in user's code
const result = await parallax.execute("security-review-pattern", request);

console.log(result);
// {
//   decision: "BLOCK_DEPLOYMENT",
//   reason: "Critical vulnerabilities with high confidence",
//   mustFix: [
//     { agent: "SecurityAgent1", issue: "SQL injection", confidence: 0.95 },
//     { agent: "SecurityAgent2", issue: "XSS", confidence: 0.88 }
//   ],
//   overallConfidence: 0.91,
//   executionTime: "2.3s",
//   agentsUsed: 3
// }
```

## The Key Insight: Parallax is the Conductor

Think of it like an orchestra:

```
PARALLAX = CONDUCTOR
- Reads the sheet music (Prism pattern)
- Tells each musician when to play (calls agents)
- Coordinates the timing (parallel execution)
- Combines individual parts into symphony (aggregates results)

AGENTS = MUSICIANS  
- Each plays their own instrument (specialized analysis)
- Don't need to know the whole piece (independent)
- Follow conductor's cues (respond to Parallax calls)
- Focus on their part (domain expertise)

PATTERN = SHEET MUSIC
- Defines how pieces fit together
- Specifies timing and coordination
- Written once, performed many times
```

## What Makes This Powerful

### 1. Agents Stay Simple
```typescript
// Agent ONLY needs to:
// 1. Analyze the specific task
// 2. Return result with confidence
// That's it!

class SimpleAgent extends ParallaxAgent {
  async analyze(task: string, data: any): Promise<[any, number]> {
    const result = doMySpecializedThing(data);
    const confidence = calculateMyConfidence(result);
    return [result, confidence];
  }
}
```

### 2. Patterns Handle Complexity
```prism
// Pattern handles ALL coordination:
// - Which agents to use
// - How to run them (parallel/sequential)
// - How to combine results
// - What to do based on confidence
// - How to handle disagreements
```

### 3. Separation of Concerns
- **Agents**: Domain expertise (WHAT to analyze)
- **Patterns**: Coordination logic (HOW to coordinate)
- **Parallax**: Execution engine (WHEN to run)

## Complete Example: Code Review with 10 Agents

```prism
// comprehensive-review.prism

// Phase 1: Security (Critical - Run First)
securityAgents = agents.filter(a => a.capabilities.includes("security"))
securityResults = parallel(securityAgents.map(a => 
  a.analyze("security check", input.code)
))

// Parallax is calling agents, agents return results
// Parallax decides what to do with results

if (hasCriticalSecurityIssues(securityResults)) {
  uncertain if (securityResults[0]) {
    high {
      // Stop here - no point running other agents
      return {
        decision: "REJECT",
        reason: "Critical security issues",
        confidence: 0.95
      } ~> 0.95
    }
    medium {
      // Continue but flag
      securityFlag = true
    }
  }
}

// Phase 2: Quality Analysis (Parallel)
qualityAgents = agents.filter(a => 
  a.capabilities.includes(["performance", "architecture", "testing"])
)
qualityResults = parallel(qualityAgents.map(a => 
  a.analyze("quality check", input.code)
))

// Phase 3: Aggregate Everything
allResults = [...securityResults, ...qualityResults]

// Identify disagreements
disagreements = findDisagreements(allResults)
if (disagreements.length > 0) {
  // Don't hide disagreements - they're valuable!
  handleDisagreements(disagreements)
}

// Build final report
report = {
  overallAssessment: weightedConsensus(allResults),
  confidence: calculateAggregateConfidence(allResults),
  criticalIssues: extractCriticalIssues(allResults),
  disagreements: disagreements,
  recommendation: synthesizeRecommendation(allResults)
}

report ~> report.confidence
```

## The Mental Model

```
USER REQUEST
     ↓
PARALLAX (reads pattern)
     ↓
PATTERN says "call these agents in this way"
     ↓
PARALLAX calls agents in parallel
     ↓
AGENTS return individual results
     ↓
PARALLAX aggregates per pattern logic
     ↓
USER gets coordinated result
```

**Parallax never tells agents what to think** - it just:
1. Calls them at the right time
2. Collects their independent analyses  
3. Combines results intelligently
4. Makes confidence-aware decisions
5. Returns aggregated insights to user

This is why it's the "coordination layer" - it coordinates independent agents to work together effectively!