---
sidebar_position: 2
title: Syntax Reference
---

# Prism Syntax Reference

Complete reference for the Prism language syntax.

## Values and Confidence

### Basic Values

```prism
// Numbers
count = 42
price = 19.99

// Strings
name = "Parallax"
message = 'Hello, world!'

// Booleans
enabled = true
disabled = false

// Null and undefined
empty = null
missing = undefined
```

### Confidence Attachment (`~>`)

Attach confidence scores to any value:

```prism
// Attach confidence to values
temperature = 72.5 ~> 0.95           // 95% confident
classification = "spam" ~> 0.87       // 87% confident
is_valid = true ~> 0.99              // 99% confident

// Confidence from variable
score = calculate_confidence()
result = analysis ~> score
```

### Confidence Extraction (`<~`)

Extract confidence from a value:

```prism
response = llm("Analyze this text")
confidence_level = <~ response        // Get the confidence score

if (confidence_level > 0.8) {
  proceed_with_result(response)
}
```

### Confidence Threshold (`~@>`)

Apply a confidence threshold to a value:

```prism
// Returns value only if confidence meets threshold
decision = response ~@> 0.7           // null if confidence < 0.7

// Use in conditions
if (analysis ~@> 0.8) {
  // Only executes if confidence >= 0.8
  deploy()
}
```

## Operators

### Arithmetic Operators

```prism
sum = a + b
difference = a - b
product = a * b
quotient = a / b
remainder = a % b
power = a ** b
```

### Comparison Operators

```prism
equal = a == b
not_equal = a != b
less_than = a < b
greater_than = a > b
less_or_equal = a <= b
greater_or_equal = a >= b
```

### Logical Operators

```prism
and_result = a && b
or_result = a || b
not_result = !a
```

### Confidence Operators

Prism includes specialized operators for confidence handling:

| Operator | Name | Description |
|----------|------|-------------|
| `~>` | Confidence Attach | Attach confidence to a value |
| `<~` | Confidence Extract | Extract confidence from a value |
| `~@>` | Confidence Threshold | Apply minimum threshold |
| `~~` | Confidence Compare | Compare confidence levels |
| `~&&` | Confidence AND | Logical AND with confidence propagation |
| `~\|\|` | Confidence OR | Logical OR with confidence propagation |

```prism
// Confidence comparison
a ~~ b                    // Compare confidence levels of a and b

// Confidence-aware logical operations
result = a ~&& b          // AND that combines confidence
result = a ~|| b          // OR that takes max confidence
```

### Pipeline Operators

Process values through pipelines:

```prism
// Standard pipeline
result = input |> process |> validate |> format

// Confidence-aware pipeline
result = input ~|> analyze ~|> validate

// Conditional pipeline (short-circuits on low confidence)
result = input ~?> risky_operation ~?> final_step
```

## Control Flow

### Standard Conditionals

```prism
if (condition) {
  do_something()
}

if (condition) {
  do_something()
} else {
  do_something_else()
}

if (condition1) {
  handle_case_1()
} else if (condition2) {
  handle_case_2()
} else {
  handle_default()
}
```

### Uncertain Conditionals

Branch based on confidence levels:

```prism
uncertain if (analysis) {
  high {
    // Confidence >= 0.7
    deploy_to_production()
  }
  medium {
    // 0.5 <= Confidence < 0.7
    request_human_review()
  }
  low {
    // Confidence < 0.5
    reject_with_explanation()
  }
}
```

Custom thresholds:

```prism
uncertain if (analysis) threshold(0.8, 0.6) {
  high {
    // Confidence >= 0.8
    auto_approve()
  }
  medium {
    // 0.6 <= Confidence < 0.8
    manual_review()
  }
  low {
    // Confidence < 0.6
    reject()
  }
}
```

### Loops

```prism
// For loop
for (i = 0; i < 10; i++) {
  process(i)
}

// For-in loop
for (item in collection) {
  process(item)
}

// While loop
while (condition) {
  do_something()
  update_condition()
}

// Do-while loop
do {
  attempt_operation()
} while (!success)
```

## Functions

### Function Declaration

```prism
fn calculate_score(input, weight) {
  base_score = analyze(input)
  return base_score * weight
}

// With confidence return
fn classify(text) {
  result = llm("Classify: " + text)
  return result ~> extract_confidence(result)
}
```

### Lambda Expressions

```prism
// Arrow function
square = (x) => x * x

// Multi-line lambda
process = (data) => {
  cleaned = clean(data)
  analyzed = analyze(cleaned)
  return analyzed
}

// Used in higher-order functions
results = items.map((x) => x * 2)
filtered = items.filter((x) => x > threshold)
```

## LLM Integration

### Basic LLM Calls

```prism
// Simple LLM call
response = llm("What is the capital of France?")

// LLM with context
response = llm("Summarize this document", context: document)

// LLM with options
response = llm("Analyze sentiment", {
  model: "gpt-4",
  temperature: 0.3,
  max_tokens: 500
})
```

### LLM with Confidence

```prism
// Confidence is automatically extracted
analysis = llm("Is this code secure?")
confidence = <~ analysis

// Use in uncertain conditionals
uncertain if (analysis) {
  high { approve() }
  medium { review() }
  low { reject() }
}
```

### Structured Output

```prism
// Request structured JSON output
result = llm("Extract entities", {
  output_schema: {
    entities: [{ name: string, type: string }]
  }
})
```

## Patterns and Agents

### Pattern Declaration

```prism
pattern content_classifier {
  // Agent selection
  agents = select(capabilities: ["classification"], min: 3)

  // Parallel execution
  results = parallel agents {
    llm("Classify: {{input.content}}")
  }

  // Aggregation
  vote_result = vote(results, method: "majority")

  return vote_result
}
```

### Agent Selection

```prism
// By capability
agents = select(capabilities: ["analysis"])

// With count constraints
agents = select(
  capabilities: ["classification"],
  min: 3,
  max: 5
)

// With preferences
agents = select(
  capabilities: ["translation"],
  prefer: ["expert-translator"]
)
```

### Parallel Execution

```prism
// Execute across agents in parallel
results = parallel agents {
  analyze(input)
}

// With timeout
results = parallel agents timeout(30000) {
  analyze(input)
}

// With early return
results = parallel agents min_results(2) {
  analyze(input)
}
```

### Sequential Execution

```prism
// Execute steps in sequence
result = sequential {
  step1 = research(input)
  step2 = analyze(step1)
  step3 = synthesize(step2)
}
```

## Aggregation

### Voting

```prism
// Majority voting
winner = vote(results, method: "majority")

// Weighted voting
winner = vote(results, {
  method: "weighted",
  weights: { "expert-agent": 2.0, default: 1.0 }
})

// Unanimous voting
winner = vote(results, method: "unanimous")
```

### Consensus

```prism
// Consensus with threshold
agreed = consensus(results, threshold: 0.8)

// Field-level consensus
agreed = consensus(results, {
  fields: {
    sentiment: { threshold: 0.7 },
    category: { threshold: 0.9 }
  }
})
```

### Merging

```prism
// Deep merge
combined = merge(results, method: "deep")

// Union merge (for arrays)
all_entities = merge(results, {
  method: "union",
  deduplicate: true
})
```

## Error Handling

### Try-Catch

```prism
try {
  result = risky_operation()
} catch (error) {
  log_error(error)
  result = fallback_value
}
```

### Validation

```prism
// Validate confidence threshold
validated = validate(result, {
  min_confidence: 0.7,
  on_failure: "retry"
})

// Schema validation
validated = validate(result, {
  schema: {
    sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
    confidence: { type: "number", min: 0, max: 1 }
  }
})
```

## Destructuring

### Basic Destructuring

```prism
// Object destructuring
{ name, age } = person

// Array destructuring
[first, second, ...rest] = items

// With defaults
{ name, age = 0 } = person
```

### Confidence-Aware Destructuring

```prism
// Destructure with confidence threshold
{ result, confidence } = analysis ~@> 0.7

// Only destructure if confidence meets threshold
if ({ data } = response ~@> 0.8) {
  process(data)
}
```

## Next Steps

- [YAML to Prism Compilation](/docs/prism/compilation) - How patterns compile
- [Using Prism Directly](/docs/prism/using-prism-directly) - Write Prism code
- [Prism Documentation](https://docs.prismlang.dev/) - Full language docs
