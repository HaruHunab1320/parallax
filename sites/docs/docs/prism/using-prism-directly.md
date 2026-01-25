---
sidebar_position: 4
title: Using Prism Directly
---

# Using Prism Directly

For advanced use cases, you can write patterns directly in Prism instead of YAML.

## When to Use Prism

Write Prism directly when you need:

- **Complex Control Flow**: Dynamic branching, loops, or recursive patterns
- **Custom Aggregation**: Algorithms beyond built-in strategies
- **Advanced Confidence Handling**: Custom confidence calculations or transformations
- **Integration Logic**: Complex input/output transformations
- **Performance Optimization**: Fine-grained execution control

## Getting Started

### Installation

```bash
# Install Prism CLI
npm install -g @prism-lang/cli

# Or add to your project
npm install @prism-lang/core
```

### Your First Prism Pattern

Create a file `my-pattern.prism`:

```prism
pattern hello_world v1.0.0 {
  input {
    name: string required
  }

  agents = select(capabilities: ["greeting"], min: 1)

  result = parallel agents {
    llm("Generate a friendly greeting for {{input.name}}")
  }

  return {
    greeting: result[0].response,
    confidence: <~ result[0]
  }
}
```

### Running Prism Patterns

```bash
# Run directly
prism run my-pattern.prism --input '{"name": "Alice"}'

# Deploy to Parallax
parallax pattern deploy my-pattern.prism
```

## Pattern Structure

### Basic Template

```prism
pattern pattern_name v1.0.0 {
  // Input schema
  input {
    field_name: type constraints
  }

  // Pattern logic
  agents = select(capabilities: [...])
  results = parallel agents { ... }
  aggregated = aggregate(results)

  // Output
  return { ... }
}
```

### Complete Example

```prism
pattern content_analyzer v2.0.0 {
  // Metadata as comments
  // Description: Analyzes content for sentiment, entities, and topics
  // Author: parallax-team
  // Tags: analysis, nlp, production

  input {
    content: string required max_length(100000)
    options: {
      include_entities: boolean default(true)
      include_topics: boolean default(true)
      language: string default("auto")
    } optional
  }

  // Select agents for different tasks
  sentiment_agents = select(capabilities: ["sentiment-analysis"], min: 5)
  entity_agents = select(capabilities: ["entity-extraction"], min: 3)
  topic_agents = select(capabilities: ["topic-modeling"], min: 3)

  // Run analyses in parallel
  sentiment_results = parallel sentiment_agents timeout(20000) {
    llm("Analyze the sentiment of this text. Return positive, negative, or neutral with a confidence score.", {
      context: input.content
    })
  }

  // Conditional entity extraction
  entity_results = if (input.options.include_entities) {
    parallel entity_agents timeout(30000) {
      llm("Extract all named entities (people, organizations, locations, dates) from this text.", {
        context: input.content
      })
    }
  } else {
    []
  }

  // Conditional topic extraction
  topic_results = if (input.options.include_topics) {
    parallel topic_agents timeout(25000) {
      llm("Identify the main topics discussed in this text.", {
        context: input.content
      })
    }
  } else {
    []
  }

  // Aggregate results
  sentiment = consensus(sentiment_results, threshold: 0.8)
  entities = merge(entity_results, method: "union", deduplicate: true)
  topics = vote(topic_results, method: "plurality")

  // Validate overall confidence
  overall_confidence = (
    (<~ sentiment) * 0.5 +
    (<~ entities) * 0.25 +
    (<~ topics) * 0.25
  )

  uncertain if (sentiment ~> overall_confidence) {
    high {
      return {
        sentiment: sentiment.result,
        entities: entities.result,
        topics: topics.result,
        confidence: {
          overall: overall_confidence,
          sentiment: <~ sentiment,
          entities: <~ entities,
          topics: <~ topics
        }
      }
    }
    medium {
      return {
        sentiment: sentiment.result,
        entities: entities.result,
        topics: topics.result,
        confidence: {
          overall: overall_confidence,
          sentiment: <~ sentiment,
          entities: <~ entities,
          topics: <~ topics
        },
        warning: "Results have medium confidence"
      }
    }
    low {
      fail("Analysis confidence too low", {
        confidence: overall_confidence,
        threshold: 0.5
      })
    }
  }
}
```

## Advanced Patterns

### Custom Aggregation

Implement custom aggregation logic:

```prism
pattern custom_aggregation v1.0.0 {
  input {
    items: [string] required
  }

  agents = select(capabilities: ["scoring"], min: 5)

  // Collect all scores
  all_scores = parallel agents {
    items.map((item) => {
      score: llm("Score this item 1-10: " + item),
      item: item
    })
  }

  // Custom aggregation: weighted average by confidence
  aggregated = all_scores.reduce((acc, agent_scores) => {
    agent_confidence = <~ agent_scores

    agent_scores.forEach((score) => {
      existing = acc.find((x) => x.item == score.item)
      if (existing) {
        existing.weighted_sum += score.score * agent_confidence
        existing.weight_total += agent_confidence
      } else {
        acc.push({
          item: score.item,
          weighted_sum: score.score * agent_confidence,
          weight_total: agent_confidence
        })
      }
    })

    return acc
  }, [])

  // Calculate final scores
  final_scores = aggregated.map((item) => ({
    item: item.item,
    score: item.weighted_sum / item.weight_total,
    confidence: item.weight_total / agents.length
  }))

  return {
    scores: final_scores.sort((a, b) => b.score - a.score)
  }
}
```

### Recursive Patterns

```prism
pattern recursive_analysis v1.0.0 {
  input {
    document: string required
    max_depth: number default(3)
  }

  fn analyze_section(section, depth) {
    if (depth >= input.max_depth) {
      return llm("Summarize this section briefly", { context: section })
    }

    // Break into subsections
    subsections = llm("Split this into logical subsections", {
      context: section,
      output_format: "json_array"
    })

    // Recursively analyze each subsection
    sub_analyses = subsections.map((sub) =>
      analyze_section(sub, depth + 1)
    )

    // Synthesize subsection analyses
    return llm("Synthesize these analyses into a coherent summary", {
      context: sub_analyses
    })
  }

  result = analyze_section(input.document, 0)

  return {
    analysis: result,
    confidence: <~ result
  }
}
```

### Dynamic Agent Selection

```prism
pattern dynamic_routing v1.0.0 {
  input {
    task: string required
    complexity: string enum("simple", "moderate", "complex")
  }

  // Dynamic agent count based on complexity
  agent_count = match input.complexity {
    "simple" => 2
    "moderate" => 4
    "complex" => 7
  }

  // Dynamic capability selection
  required_caps = if (input.task.contains("translate")) {
    ["translation", input.detected_language]
  } else if (input.task.contains("analyze")) {
    ["analysis", "reasoning"]
  } else {
    ["general"]
  }

  agents = select(
    capabilities: required_caps,
    min: agent_count,
    max: agent_count + 2
  )

  results = parallel agents {
    llm(input.task)
  }

  // Dynamic aggregation based on complexity
  aggregated = match input.complexity {
    "simple" => first(results, min_confidence: 0.6)
    "moderate" => vote(results, method: "majority")
    "complex" => consensus(results, threshold: 0.85)
  }

  return aggregated
}
```

### Error Recovery

```prism
pattern resilient_execution v1.0.0 {
  input {
    data: object required
  }

  agents = select(capabilities: ["processing"], min: 3, max: 10)

  fn execute_with_retry(attempt) {
    try {
      results = parallel agents timeout(30000) {
        process(input.data)
      }

      aggregated = consensus(results, threshold: 0.7)

      if (<~ aggregated < 0.7 && attempt < 3) {
        // Add more agents and retry
        additional = select(capabilities: ["processing"], min: 2)
        agents = agents.concat(additional)
        return execute_with_retry(attempt + 1)
      }

      return aggregated
    } catch (error) {
      if (attempt < 3) {
        log("Attempt " + attempt + " failed, retrying...")
        wait(1000 * attempt)  // Exponential backoff
        return execute_with_retry(attempt + 1)
      }
      throw error
    }
  }

  result = execute_with_retry(1)

  return {
    result: result,
    confidence: <~ result
  }
}
```

## Integration with YAML

### Hybrid Approach

Use Prism for complex logic, YAML for configuration:

```yaml
# pattern-config.yaml
name: hybrid-pattern
version: 1.0.0

input:
  document: string

# Reference Prism module for complex logic
logic:
  module: ./custom-logic.prism
  entry: analyze_document

output:
  result: $logic.result
```

```prism
// custom-logic.prism
export fn analyze_document(input) {
  // Complex analysis logic here
  // ...
  return { result: analysis }
}
```

### Importing Prism in Patterns

```yaml
name: pattern-with-import
version: 1.0.0

imports:
  - name: custom_aggregation
    from: ./aggregations.prism

aggregation:
  strategy: custom
  function: $custom_aggregation.weighted_consensus
```

## Prism SDK

### TypeScript Integration

```typescript
import { PrismRuntime, Pattern } from '@prism-lang/core';
import { ParallaxClient } from '@parallax/sdk';

// Parse and compile Prism code
const runtime = new PrismRuntime();
const pattern = runtime.compile(`
  pattern my_pattern v1.0.0 {
    input { text: string }
    // ...
  }
`);

// Execute via Parallax
const client = new ParallaxClient();
const result = await client.execute(pattern, {
  text: "Hello, world!"
});
```

### Custom Functions

Register custom functions for use in Prism:

```typescript
import { PrismRuntime } from '@prism-lang/core';

const runtime = new PrismRuntime();

// Register custom function
runtime.registerFunction('calculate_similarity', (a: string, b: string) => {
  // Custom similarity calculation
  return cosineSimilarity(embed(a), embed(b));
});

// Use in Prism code
const pattern = runtime.compile(`
  pattern similarity_check v1.0.0 {
    input { text1: string, text2: string }

    similarity = calculate_similarity(input.text1, input.text2)

    return { similarity: similarity ~> 0.95 }
  }
`);
```

## Debugging Prism

### Debug Mode

```bash
# Run with debug output
prism run pattern.prism --debug

# Enable tracing
prism run pattern.prism --trace
```

### Breakpoints

```prism
pattern debuggable v1.0.0 {
  input { data: string }

  // Add debug breakpoint
  @breakpoint
  intermediate = process(input.data)

  // Log intermediate values
  @log("Intermediate result", intermediate)

  result = finalize(intermediate)

  return result
}
```

### AST Inspection

```bash
# View parsed AST
prism parse pattern.prism --output ast

# Validate without executing
prism validate pattern.prism
```

## Resources

- **Prism Documentation**: [docs.prismlang.dev](https://docs.prismlang.dev/)
- **Prism Repository**: [github.com/HaruHunab1320/Prism-TS](https://github.com/HaruHunab1320/Prism-TS)
- **Prism API Reference**: [docs.prismlang.dev/docs/api/core/parser](https://docs.prismlang.dev/docs/api/core/parser)

## Next Steps

- [Prism Syntax Reference](/prism/syntax) - Complete syntax
- [YAML to Prism Compilation](/prism/compilation) - Compilation process
- [Pattern SDK](/sdk/pattern-sdk) - Build patterns programmatically
