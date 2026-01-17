# Pattern SDK Battle Test Suite

A comprehensive testing framework to evaluate the Pattern SDK's ability to generate valid orchestration patterns from various requirements.

## Overview

The battle test suite tests the Pattern SDK against:
- **20+ test cases** across 7 categories
- **Simple to complex** orchestration scenarios
- **Edge cases** and error conditions
- **Domain-specific** patterns
- **Natural language** variations

## Running Tests

### Quick Start

```bash
# Run mini test (5 selected test cases)
pnpm tsx test/run-battle-test.ts --mini

# Analyze results only
pnpm tsx test/run-battle-test.ts --analyze
```

### Full Test Suite

```bash
# Run all tests (requires confirmation)
pnpm tsx test/run-battle-test.ts --full

# Clean and run fresh
pnpm tsx test/run-battle-test.ts --clean --full
```

## Test Categories

1. **Simple Patterns** - Basic parallel/sequential execution
2. **Consensus Patterns** - Multi-agent consensus scenarios
3. **Error Handling** - Retry, fallback, timeout patterns
4. **Complex Patterns** - Multi-stage pipelines with multiple primitives
5. **Edge Cases** - Missing data, conflicts, extreme values
6. **Natural Language** - Vague or contradictory requirements
7. **Domain-Specific** - Security, medical, financial use cases

## Results

After running tests, you'll find:

```
test/battle-test-results/
├── patterns/               # Successfully generated patterns
│   ├── simple/
│   ├── consensus/
│   └── ...
├── battle-test-report.json # Detailed test results
├── battle-test-report.md   # Human-readable report
├── analysis.json          # Analysis insights
└── analysis.md            # Analysis report with recommendations
```

## Understanding Results

The analysis provides:
- **Success Rate** - Overall and by category
- **Common Issues** - Frequently occurring problems
- **Pattern Quality** - Code quality metrics
- **Improvement Roadmap** - Prioritized recommendations

### Key Metrics

- **Success Rate**: % of tests that generate valid, working patterns
- **Valid Syntax Rate**: % of patterns with valid Prism syntax
- **Confidence Flow Rate**: % with proper dynamic confidence
- **Complexity Score**: Average pattern complexity

## Example Test Case

```typescript
{
  id: 'consensus-1',
  name: 'Simple consensus',
  category: 'consensus',
  requirements: {
    goal: "Reach consensus among multiple reviewers",
    strategy: "consensus",
    minConfidence: 0.8,
    agents: [{ capability: "reviewer", count: 5 }]
  },
  expectedPrimitives: ['parallel', 'consensus']
}
```

## Next Steps

After analyzing results:

1. **Fix Critical Issues** - Address patterns with 0% success
2. **Improve Common Problems** - Fix frequently occurring issues
3. **Optimize Generated Code** - Remove redundant steps
4. **Test with Real Agents** - Validate patterns actually work

## Adding New Tests

Add test cases to `battle-test-suite.ts`:

```typescript
{
  id: 'your-test-id',
  name: 'Your test name',
  category: 'category-name',
  requirements: {
    goal: "What the pattern should do",
    // ... other requirements
  },
  expectedPrimitives: ['expected', 'primitives'] // optional
}
```