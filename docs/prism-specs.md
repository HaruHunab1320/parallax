# Prism Programming Language: Complete Technical Specification

## Language Overview

Prism is a **confidence-aware programming language** designed specifically for AI applications and uncertainty handling. It extends traditional programming with first-class uncertainty support through specialized confidence operators, making uncertainty propagation and decision-making explicit and automatic.

**Core Philosophy**: Every value in Prism can have an associated confidence level, and uncertainty flows naturally through operations without manual tracking.

## Installation and Setup

```bash
# Clone the repository
git clone https://github.com/HaruHunab1320/Prism-TS.git
cd prism-ts

# Install dependencies
npm install

# Run interactive REPL
npm run repl

# Run benchmark demo
npm run demo
```

## File Structure and Execution

```bash
# Prism files use .prism extension
node prism-runner confidence-demo.prism

# Interactive REPL
npm run repl
```

## Complete Confidence Operator Reference

Prism features **18 specialized confidence operators** that handle uncertainty propagation:

| Operator | Name | Description | Syntax Example | Behavior |
|----------|------|-------------|----------------|----------|
| `~>` | Confidence Assignment | Assign confidence to any value | `temp ~> 0.9` | Creates confident value |
| `<~` | Confidence Extraction | Extract confidence as number | `conf = <~ temp` | Returns confidence level |
| `~~` | Confidence Chaining | Chain operations with min confidence | `a ~~ b ~~ c` | Propagates minimum confidence |
| `~??` | Confidence Coalesce | Fallback for low confidence | `primary ~?? backup` | Uses backup if primary confidence too low |
| `~&&` | Confident AND | Logical AND with min confidence | `a ~&& b` | Returns minimum confidence |
| `~\|\|` | Confident OR | Logical OR with max confidence | `a ~\|\| b` | Returns maximum confidence |
| `~+` | Confident Addition | Add with confidence propagation | `a ~+ b` | Arithmetic with confidence |
| `~-` | Confident Subtraction | Subtract with confidence | `a ~- b` | Arithmetic with confidence |
| `~*` | Confident Multiplication | Multiply with confidence | `a ~* b` | Arithmetic with confidence |
| `~/` | Confident Division | Divide with confidence | `a ~/ b` | Arithmetic with confidence |
| `~==` | Confident Equality | Compare with confidence | `a ~== b` | Comparison with confidence |
| `~!=` | Confident Inequality | Not equal with confidence | `a ~!= b` | Comparison with confidence |
| `~>` | Confident Greater | Greater than with confidence | `a ~> b` | Comparison with confidence |
| `~>=` | Confident Greater Equal | Greater/equal with confidence | `a ~>= b` | Comparison with confidence |
| `~<` | Confident Less | Less than with confidence | `a ~< b` | Comparison with confidence |
| `~<=` | Confident Less Equal | Less/equal with confidence | `a ~<= b` | Comparison with confidence |
| `~.` | Confident Property Access | Safe navigation with confidence | `obj ~. prop` | Property access with confidence |
| `~\|\|>` | Parallel Confidence | Select highest confidence | `a ~\|\|> b ~\|\|> c` | Chooses most confident result |
| `~@>` | Threshold Gate | Execute if confidence ≥ threshold | `check ~@> action` | Conditional execution |

## Core Language Syntax

### Variable Declaration and Confidence Assignment

```prism
// Basic variable assignment
temperature = 22.5

// Confidence assignment - attaching confidence level
temperature = 22.5 ~> 0.9   // 90% confidence

// Multiple assignments
sensor1 = 23.1 ~> 0.8
sensor2 = 22.9 ~> 0.7
```

### Confidence Extraction

```prism
// Extract confidence level from a value
temp_confidence = <~ temperature   // Returns 0.9

// Use in calculations
if (temp_confidence > 0.8) {
    // High confidence actions
}
```

### Confident Arithmetic Operations

```prism
// Traditional arithmetic propagates uncertainty automatically
result = (sensor1 ~+ sensor2) ~* factor
// result inherits minimum confidence from operations

// Explicit confidence propagation
combined = sensor1 ~+ sensor2   // Confidence = min(0.8, 0.7) = 0.7
scaled = combined ~* 1.5        // Maintains confidence of 0.7
```

### Confidence Flow Control - uncertain if

```prism
// Core confidence-based conditional structure
uncertain if (analysis ~> 0.8) {
    high { deploy_to_production() }
    medium { deploy_to_staging() }
    low { request_human_review() }
}

// With explicit confidence checking
uncertain if (weather ~> 0.7) {
    high { print("☀️ Go outside!") }
    medium { print("🌤️ Maybe go outside") }
    low { print("🌧️ Stay indoors") }
}
```

### Confidence Coalescing and Fallbacks

```prism
// Cascade through options based on confidence thresholds
result = primary_source ~?? backup_source ~?? default_value

// Multi-level fallback
best_answer = gpt_result ~?? claude_result ~?? gemini_result ~?? "unknown"
```

### Parallel Confidence Selection

```prism
// Run multiple models and select the most confident result
best_model = model1_response ~||> model2_response ~||> model3_response

// Chain multiple parallel operations
result = (option1 ~||> option2) ~?? fallback_option
```

### Threshold-Based Execution

```prism
// Execute only if confidence meets threshold
critical_operation = high_confidence_check ~@> "proceed_with_action"

// Conditional execution with confidence gates
decision = weather_analysis ~@> "auto_approve" ~?? "manual_review"
```

### Confident Logical Operations

```prism
// Logical operations that preserve confidence
spam_check = llm("Is this spam?")
toxicity_check = llm("Is this toxic?")

// Combine checks with confidence - takes minimum confidence
safety = spam_check ~&& toxicity_check

// OR operation takes maximum confidence
backup_safety = primary_check ~|| secondary_check
```

### Confident Property Access

```prism
// Safe navigation with confidence propagation
user_email = user_data ~. profile ~. email
// Confidence propagated through property chain

// Traditional vs confident access
risky_access = obj.prop.nested     // May throw errors
safe_access = obj ~. prop ~. nested // Returns with confidence
```

## Advanced Patterns and Examples

### Multi-Model Consensus System

```prism
content = "User comment here..."

// Multiple AI model analysis
spam_check = llm("Is this spam?")
toxicity_check = llm("Is this toxic?") 
sentiment = llm("Analyze sentiment")

// Combine multiple checks with confidence
safety = spam_check ~&& toxicity_check
final_decision = safety ~||> sentiment

// Make decision based on confidence levels
uncertain if (final_decision ~> 0.8) {
    high { status = "✅ Auto-approved" }
    medium { status = "⚠️ Needs review" }
    low { status = "🚫 Blocked" }
}
```

### Sensor Data Processing

```prism
// IoT sensor readings with confidence
temperature_sensor1 = 22.5 ~> 0.9
temperature_sensor2 = 22.8 ~> 0.7
backup_reading = 22.0 ~> 0.5

// Combine sensors with confidence-aware arithmetic
avg_temp = (temperature_sensor1 ~+ temperature_sensor2) ~/ 2
final_reading = avg_temp ~?? backup_reading

// Make decisions based on confidence
uncertain if (final_reading ~> 0.7) {
    high { activate_hvac_system() }
    medium { log_temperature_reading() }
    low { request_manual_verification() }
}
```

### AI Pipeline with Confidence Tracking

```prism
// AI pipeline with automatic confidence propagation
user_input = "Analyze this financial data"
gpt_analysis = llm_call("gpt-4", user_input)
claude_analysis = llm_call("claude", user_input)

// Select best analysis or combine
best_analysis = gpt_analysis ~||> claude_analysis

// Chain operations while preserving confidence
risk_assessment = best_analysis ~@> calculate_risk()
final_recommendation = risk_assessment ~?? conservative_fallback()

// Execute based on confidence threshold
decision = final_recommendation ~@> "execute_trade" ~?? "request_approval"
```

## Function Definitions with Confidence

```prism
// Functions can work with confident values
function analyze_sentiment(text) {
    primary_result = llm("Analyze sentiment: " + text)
    backup_result = rule_based_sentiment(text) ~> 0.6
    
    return primary_result ~?? backup_result
}

// Function calls propagate confidence automatically
user_comment = "This product is amazing!"
sentiment = analyze_sentiment(user_comment)
```

## Error Handling and Confidence

```prism
// Confidence-aware error handling
risky_operation = external_api_call() ~> 0.8

uncertain if (risky_operation ~> 0.9) {
    high { 
        process_result(risky_operation)
    }
    medium {
        log_warning("Medium confidence result")
        process_with_caution(risky_operation)
    }
    low {
        use_fallback_method()
    }
}
```

## Type System and Confidence

### Confident Values
```prism
// Every value can have confidence
number_with_confidence = 42 ~> 0.9
string_with_confidence = "hello" ~> 0.8
array_with_confidence = [1, 2, 3] ~> 0.7

// Extract base value and confidence separately
base_value = number_with_confidence        // 42
confidence_level = <~ number_with_confidence // 0.9
```

### Confidence Propagation Rules

1. **Arithmetic Operations**: Use minimum confidence of operands
2. **Logical AND (`~&&`)**: Use minimum confidence
3. **Logical OR (`~||`)**: Use maximum confidence  
4. **Parallel Selection (`~||>`)**: Select highest confidence value
5. **Coalescing (`~??`)**: Use first value above confidence threshold
6. **Property Access (`~.`)**: Propagate confidence through chain

## LLM Integration Patterns

### Built-in LLM Support
```prism
// Automatic confidence from LLM responses
response = llm("Analyze this data")
// response automatically includes confidence based on model certainty

// Multiple LLM consensus
gpt_result = llm("gpt-4", prompt)
claude_result = llm("claude", prompt)
consensus = gpt_result ~||> claude_result

// Confidence-based routing
uncertain if (response ~> 0.8) {
    high { auto_approve(response) }
    medium { flag_for_review(response) }
    low { escalate_to_human(response) }
}
```

## Development and Testing

### Project Structure
```
src/
├── core/                   # Language core
│   ├── tokenizer.ts       # 18 confidence operators
│   ├── parser.ts          # Recursive descent parser  
│   ├── runtime.ts         # Confidence-aware interpreter
│   └── operators.test.ts  # 100% test coverage
├── confidence/            # Confidence value system
├── context/              # Context management
├── llm/                  # LLM provider integrations
└── repl/                 # Interactive REPL
```

### Testing Commands
```bash
# Run all tests (191/191 passing)
npm test

# Run operator-specific tests
npm test operators.test.ts

# Run with coverage
npm test -- --coverage

# Build project
npm run build

# Lint code
npm run lint
```

## Performance Characteristics

Based on benchmarks comparing equivalent functionality:

| Metric | Prism | Traditional JS | Improvement |
|--------|-------|---------------|-------------|
| Lines of Code | 77 | 250 | 69% reduction |
| Confidence Bugs | 0 | ∞ | Eliminated |
| Development Time | Minutes | Hours | 3x faster |
| Boilerplate Code | None | Everywhere | 100% removed |

## Common Use Cases

### Production Applications
- **Confidence tracking across microservices**
- **Automated decision pipelines with thresholds**  
- **Multi-model consensus systems**
- **Uncertainty quantification experiments**

### AI/ML Workflows
- **Ensemble learning prototypes**
- **Confidence-based hyperparameter tuning**
- **Model output validation**
- **Automated vs manual routing**

### System Integration
- **Confidence-based caching strategies**
- **Risk analysis with confidence budgets**
- **IoT sensor data fusion**
- **Scientific computing with error propagation**

## Language Design Principles

1. **Uncertainty as First-Class Citizen**: Every value can carry confidence
2. **Automatic Propagation**: Confidence flows through operations naturally
3. **Explicit Decision Making**: `uncertain if` makes confidence-based decisions clear
4. **Composable Operations**: Operators can be chained and combined
5. **AI-Native Design**: Built specifically for AI/ML uncertainty patterns
6. **TypeScript Integration**: Full type safety and modern tooling

## Current Status and Future

- **Current**: TypeScript implementation with 191/191 tests passing
- **Language Features**: All 18 confidence operators implemented
- **LLM Integration**: Built-in support for major LLM providers
- **Development**: Active development with MIT license

This specification provides the complete technical reference for writing Prism code with confidence operators, uncertainty handling, and AI-native patterns that eliminate traditional uncertainty tracking boilerplate.