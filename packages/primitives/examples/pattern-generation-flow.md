# Pattern Generation Flow Examples

## 🎮 Minecraft Castle Analysis

### User Input:
```javascript
const request = {
  task: "I need to analyze a Minecraft world for the best location to build a castle. Check terrain, resources, nearby threats, and water access. Need high confidence in the recommendation.",
  context: {
    worldType: "survival",
    biomes: ["plains", "forest", "mountains"],
    buildSize: "large"
  }
}
```

### Pattern Composer Agent Analysis:

#### 1. Requirements Analysis (Structured Output):
```json
{
  "goal": "Find optimal castle location with multi-factor analysis",
  "strategy": "parallel",
  "actors": ["terrain-analyzer", "resource-scanner", "threat-detector", "water-finder"],
  "constraints": {
    "minConfidence": 0.85,
    "maxTime": 30000,
    "fallback": "default spawn area"
  },
  "reasoning": "Multiple independent analyses needed for different aspects, high confidence required for permanent structure"
}
```

#### 2. Primitive Selection (Structured Output):
```json
{
  "selected": [
    {
      "name": "parallel",
      "config": { "maxConcurrency": 4 },
      "reason": "Analyze different aspects simultaneously"
    },
    {
      "name": "voting",
      "config": { "strategy": "weighted" },
      "reason": "Different aspects have different importance"
    },
    {
      "name": "threshold",
      "config": { "threshold": 0.85 },
      "reason": "Only accept high-confidence locations"
    },
    {
      "name": "cache",
      "config": { "ttl": 3600 },
      "reason": "Cache results for same world/region"
    },
    {
      "name": "fallback",
      "config": { "to": "spawn_area" },
      "reason": "Safe default if no good location found"
    }
  ],
  "order": ["parallel", "voting", "threshold", "cache", "fallback"],
  "confidence": 0.88
}
```

## 🏢 Autonomous Company Decision

### User Input:
```javascript
const request = {
  task: "Our AI company needs to decide on a new product feature. Get input from market analysis, technical feasibility, customer feedback, and competitive analysis. Need consensus before proceeding, with ability to escalate to human board if needed.",
  context: {
    companyType: "autonomous-ai",
    decisionLevel: "strategic",
    riskTolerance: "medium"
  }
}
```

### Pattern Composer Agent Analysis:

#### 1. Requirements Analysis (Structured Output):
```json
{
  "goal": "Multi-department consensus for strategic product decision",
  "strategy": "consensus",
  "actors": ["market", "technical", "customer", "competitive"],
  "constraints": {
    "minConfidence": 0.8,
    "fallback": "human-board@company.ai",
    "maxTime": null
  },
  "reasoning": "Strategic decision requires consensus from all departments with human escalation for low confidence"
}
```

#### 2. Primitive Selection (Structured Output):
```json
{
  "selected": [
    {
      "name": "circuit",
      "config": { "threshold": 5 },
      "reason": "Protect against API failures during analysis"
    },
    {
      "name": "parallel",
      "config": null,
      "reason": "Departments analyze independently"
    },
    {
      "name": "retry",
      "config": { "maxRetries": 2, "strategy": "exponential" },
      "reason": "Ensure reliable department responses"
    },
    {
      "name": "consensus",
      "config": { "threshold": 0.8 },
      "reason": "Build agreement across departments"
    },
    {
      "name": "transform",
      "config": { "type": "boost", "amount": 0.1 },
      "reason": "Boost confidence for strong market signals"
    },
    {
      "name": "quorum",
      "config": { "required": 3 },
      "reason": "Ensure minimum participation"
    },
    {
      "name": "escalate",
      "config": { "to": "human-board" },
      "reason": "Human oversight for critical decisions"
    }
  ],
  "order": ["circuit", "parallel+retry", "consensus", "transform", "quorum", "escalate"],
  "confidence": 0.92
}
```

## Key Differences:

### Minecraft Pattern:
- **Simpler flow**: Analysis → Voting → Threshold → Cache → Fallback
- **Gaming context**: Terrain, resources, threats specific to Minecraft
- **Weighted voting**: Different aspects have different importance
- **Cache heavy**: Same world analysis can be reused

### Autonomous Company Pattern:
- **Complex flow**: Circuit → Parallel+Retry → Consensus → Transform → Quorum → Escalate
- **Business context**: Market, technical, customer perspectives
- **Consensus-driven**: Need agreement, not just voting
- **Human escalation**: Critical decisions can go to human board
- **Reliability focused**: Circuit breakers, retries, quorum requirements

Both patterns are auto-generated based on the natural language requirements and context!