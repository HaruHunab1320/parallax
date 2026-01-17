# Parallax Full System Demo

This demo showcases all the major capabilities of Parallax, including:

1. **Basic Pattern Execution** - Running pre-defined patterns
2. **Multi-Agent Consensus** - Getting agreement from multiple agents
3. **Natural Language Pattern Generation** - Creating patterns from plain English
4. **Confidence Extraction** - Automatic confidence scoring
5. **Complex Orchestrations** - Multi-stage workflows with primitives

## Prerequisites

Make sure the following are running:
- Parallax system (`pnpm start` in the root directory)
- Control Plane API on port 8080
- etcd for service registry

## Installation

```bash
cd demos/full-system-demo
pnpm install
```

## Running the Demo

### Option 1: Full Demo (Agents + Scenarios)
```bash
pnpm start
```

This will:
1. Start all demo agents (sentiment, code review, validation, experts, pattern composer)
2. Wait for agents to register
3. Run through all demo scenarios

### Option 2: Just the Agents
```bash
pnpm run agents
```

Starts the demo agents on ports 50100-50106:
- **Sentiment Agent** (50100) - Analyzes text sentiment with confidence
- **Code Review Agent** (50101) - Reviews code quality
- **Data Validation Agent** (50102) - Validates data with keyword-based confidence
- **Security Expert** (50103) - Security-focused analysis
- **Performance Expert** (50104) - Performance analysis
- **Usability Expert** (50105) - UX/usability analysis
- **Pattern Composer** (50106) - Generates patterns from natural language

### Option 3: Test Pattern Generation
```bash
pnpm run test-pattern
```

Tests the pattern generation capabilities with various natural language inputs.

## Demo Scenarios

### 1. Basic Pattern Execution
Executes a simple consensus pattern to analyze sentiment.

### 2. Multi-Agent Consensus
Gets consensus from three expert agents (security, performance, usability) on code quality.

### 3. Natural Language to Pattern
Converts a natural language request into an executable pattern using primitives:
- "Process feedback from 5 sources in parallel"
- "Combine with high confidence"
- "Escalate if confidence < 80%"

### 4. Data Validation Pipeline
Shows automatic confidence extraction from validation results using keywords.

### 5. Complex Multi-Stage Orchestration
Demonstrates a complex workflow with:
- Parallel execution
- Consensus building
- Confidence-based routing

## Key Features Demonstrated

### Confidence Extraction
- **@with_confidence decorator** - Automatically extracts confidence from results
- **Keyword analysis** - Detects confidence indicators in text
- **LLM extraction** - Finds confidence values in structured responses

### Pattern Composition
- **Primitives** - 31+ atomic building blocks
- **Composition Engine** - Assembles primitives into patterns
- **Pattern Validation** - Ensures generated patterns are valid

### Agent Capabilities
- **Simple agents** - Focus only on their expertise
- **Pattern-aware agents** - Can request pattern composition
- **Confidence propagation** - Flows through the system

## Architecture Insights

1. **Agents are simple** - They just analyze and return results with confidence
2. **Patterns handle complexity** - Orchestration logic lives in patterns
3. **Primitives are composable** - Complex patterns from simple building blocks
4. **Confidence is first-class** - Flows naturally through the system
5. **Language agnostic** - Agents can be in any language (TypeScript, Python, Go, Rust)

## Troubleshooting

### Agents won't start
- Check if ports 50100-50106 are available
- Ensure Parallax system is running first

### Pattern execution fails
- Verify Control Plane API is accessible on port 8080
- Check agent registration in the logs

### Confidence extraction issues
- Review the confidence keywords in results
- Check extraction strategy (llm, keywords, hybrid)

## Next Steps

1. **Create your own agents** - Use any SDK (TypeScript, Python, Go, Rust)
2. **Design custom patterns** - Compose primitives for your use case
3. **Build pattern-aware systems** - Let agents generate their own orchestrations
4. **Add to the primitive library** - Contribute new building blocks

## Summary

This demo proves that Parallax is a complete, production-ready AI orchestration platform with:
- ✅ Natural language to pattern generation
- ✅ Confidence as a first-class citizen
- ✅ Primitive-based composition
- ✅ Multi-language support
- ✅ Pattern-aware agents
- ✅ Automatic confidence extraction

The system is ready for real-world use cases! 🚀