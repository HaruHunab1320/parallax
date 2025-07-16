# Parallax: The Simple Picture

## What Happens When You Use Parallax

```
Step 1: You Make a Request
┌─────────────────────────┐
│   "Analyze this code"   │ ← You
└───────────┬─────────────┘
            ↓

Step 2: You Choose a Pattern
┌─────────────────────────┐
│  parallax.execute(      │
│    "security-review",   │ ← You pick which pattern
│    { code: myCode }     │
│  )                      │
└───────────┬─────────────┘
            ↓

Step 3: Parallax Reads the Pattern
┌─────────────────────────┐
│  security-review.prism  │
│  ─────────────────────  │
│  agents = filter(...)   │ ← Pattern says WHO to call
│  results = parallel(..) │ ← Pattern says HOW to call
│  if (critical) {...}    │ ← Pattern says WHAT to do
└───────────┬─────────────┘
            ↓

Step 4: Parallax Calls Agents (IN PARALLEL!)
┌─────────────────────────────────────────────┐
│               PARALLAX                       │
│  "Hey agents, analyze this code"            │
│     ↓            ↓            ↓             │
│  Agent 1      Agent 2      Agent 3          │
│  (working)    (working)    (working)        │
│     ↓            ↓            ↓             │
│  "Found SQL"  "Found XSS"  "Looks OK"      │
│  conf: 0.95   conf: 0.88   conf: 0.6       │
└───────────┬─────────────────────────────────┘
            ↓

Step 5: Parallax Combines Results (INTELLIGENTLY!)
┌─────────────────────────┐
│  Pattern Logic:         │
│  ─────────────────      │
│  • 2 critical issues    │
│  • High confidence      │
│  • Decision: BLOCK      │
└───────────┬─────────────┘
            ↓

Step 6: You Get One Clear Answer
┌─────────────────────────┐
│  {                      │
│    decision: "BLOCK",   │ ← You get this
│    issues: [...],       │
│    confidence: 0.91     │
│  }                      │
└─────────────────────────┘
```

## The Key Points:

### 1. **Agents Don't Talk to Each Other**
```
Agent1 ←X→ Agent2  (Agents don't communicate)
  ↓         ↓
  Parallax   (Parallax collects all results)
```

### 2. **Agents Don't Know About Patterns**
```typescript
// Agent just knows how to analyze:
analyze(task, data) {
  result = doMyThing(data);
  confidence = howSureAmI(result);
  return [result, confidence];
}
// That's it! No orchestration logic!
```

### 3. **Patterns Don't Know About Specific Agents**
```prism
// Pattern just says what capabilities it needs:
agents = filter(a => a.capabilities.includes("security"))
// Works with ANY security agents!
```

### 4. **Parallax Is the Glue**
```
Pattern (what to do) + Agents (who does it) = Parallax (makes it happen)
```

## Real Example: E-commerce Security Check

```
You: "Check if this e-commerce code is secure"
            ↓
Parallax: Loads "security-review" pattern
            ↓
Pattern: "I need all security agents"
            ↓
Parallax: Finds 3 security agents
            ↓
Parallax: Calls all 3 AT THE SAME TIME
            ↓
    SQLAgent: "Found SQL injection!" (0.95 confidence)
    XSSAgent: "Found XSS!" (0.88 confidence)  
    AuthAgent: "Auth looks OK" (0.7 confidence)
            ↓
Pattern: "2 high-confidence issues = BLOCK"
            ↓
Parallax: Returns to you: "BLOCK - Critical issues found"
```

## Why This Matters

### Without Parallax:
```python
# You'd write this mess:
sql_result = sql_agent.analyze(code)
xss_result = xss_agent.analyze(code)  # Sequential - slow!
auth_result = auth_agent.analyze(code)

# Manual aggregation
if sql_result.confidence > 0.8 and sql_result.severity == "critical":
    decision = "BLOCK"
elif xss_result.confidence > 0.8:
    # ... more manual logic ...
    
# Handle failures, timeouts, disagreements...
# 100s of lines of orchestration code!
```

### With Parallax:
```javascript
// You write this:
const result = await parallax.execute("security-review", { code });
// Done! Parallax handled everything!
```

## The Magic:

1. **Parallel by Default** - 3x faster automatically
2. **Confidence-Aware** - Decisions based on certainty
3. **Handles Complexity** - Disagreements, failures, etc.
4. **Reusable Patterns** - Write once, use everywhere
5. **Add Agents Anytime** - Pattern automatically uses them

**Parallax = The conductor that makes your agent orchestra play in harmony!**