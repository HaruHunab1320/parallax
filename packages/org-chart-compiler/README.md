# @parallax/org-chart-compiler

DSL compiler for multi-agent organizational structures and workflows. Parse YAML/JSON org-chart patterns and compile them to various output formats.

## Features

- **YAML/JSON parsing** - Define org structures in familiar formats
- **Pattern validation** - Comprehensive validation with helpful error messages
- **Multiple targets** - Compile to Prism DSL, JSON execution plans, or Mermaid diagrams
- **Custom targets** - Create your own compilation targets
- **TypeScript-first** - Full type definitions included

## Installation

```bash
npm install @parallax/org-chart-compiler
# or
pnpm add @parallax/org-chart-compiler
```

## Quick Start

```typescript
import { OrgChartCompiler } from '@parallax/org-chart-compiler';

// Parse YAML pattern
const pattern = OrgChartCompiler.parse(`
name: code-review-team
structure:
  name: Engineering Team
  roles:
    engineer:
      capabilities: [coding, testing]
      minInstances: 2
    reviewer:
      capabilities: [code-review]
      reportsTo: engineer
    lead:
      capabilities: [management]
      singleton: true
workflow:
  name: code-review-workflow
  steps:
    - type: assign
      role: engineer
      task: "Implement feature"
    - type: review
      reviewer: reviewer
      subject: step_0_result
    - type: approve
      approver: lead
      subject: step_1_result
`);

// Validate
const validation = OrgChartCompiler.validate(pattern);
if (!validation.valid) {
  console.error(validation.errors);
}

// Compile to different targets
const prismCode = OrgChartCompiler.compile(pattern, { target: 'prism' });
const jsonPlan = OrgChartCompiler.compile(pattern, { target: 'json' });
const diagram = OrgChartCompiler.compile(pattern, { target: 'mermaid' });
```

## Pattern DSL

### Role Definition

```yaml
roles:
  engineer:
    name: Engineer          # Human-readable name
    type: claude            # Agent/worker type
    capabilities:           # Required capabilities
      - coding
      - testing
    reportsTo: lead         # Reporting structure
    minInstances: 1         # Scaling config
    maxInstances: 5
    singleton: false        # If true, exactly one instance
```

### Workflow Steps

```yaml
workflow:
  name: my-workflow
  steps:
    # Assign task to role
    - type: assign
      role: engineer
      task: "Implement the feature"

    # Parallel execution
    - type: parallel
      steps:
        - type: assign
          role: engineer
          task: "Write code"
        - type: assign
          role: tester
          task: "Write tests"

    # Review with feedback
    - type: review
      reviewer: reviewer
      subject: ${step_0_result}

    # Approval gate
    - type: approve
      approver: lead
      subject: ${step_1_result}

    # Conditional branching
    - type: condition
      check: "${step_0_result.confidence} > 0.8"
      then:
        type: approve
        approver: lead
      else:
        type: assign
        role: engineer
        task: "Revise implementation"

    # Aggregate results
    - type: aggregate
      method: consensus  # or majority, merge, best
```

## API Reference

### `OrgChartCompiler`

```typescript
class OrgChartCompiler {
  // Parse YAML/JSON string to OrgPattern
  static parse(input: string, format?: 'yaml' | 'json'): OrgPattern;

  // Load pattern from file
  static loadFromFile(path: string): Promise<OrgPattern>;

  // Validate pattern structure
  static validate(pattern: OrgPattern): ValidationResult;

  // Compile pattern to target output
  static compile(pattern: OrgPattern, options?: CompileOptions): CompileResult;

  // Compile from file directly
  static compileFromFile(inputPath: string, outputPath?: string, options?: CompileOptions): Promise<string>;

  // Get JSON execution plan
  static compileToJson(pattern: OrgPattern): object;

  // Register custom target
  static registerTarget(target: CompileTarget): void;

  // List available targets
  static getTargets(): string[];
}
```

### `CompileOptions`

```typescript
interface CompileOptions {
  target?: string | CompileTarget;  // Target name or custom target
  includeComments?: boolean;        // Include comments in output
  prettyPrint?: boolean;            // Pretty print output
  variables?: Record<string, unknown>;  // Custom variables
}
```

### `CompileResult`

```typescript
interface CompileResult {
  name: string;           // Pattern name
  output: string;         // Generated output
  format: 'code' | 'json' | 'yaml';  // Output format
  metadata: PatternMetadata;  // Extracted metadata
}
```

### `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface ValidationError {
  path: string;      // e.g., 'structure.roles.engineer.capabilities'
  message: string;
  severity: 'error' | 'warning';
}
```

## Built-in Targets

| Target | Format | Description |
|--------|--------|-------------|
| `prism` | code | Parallax Prism DSL code |
| `json` | json | JSON execution plan |
| `mermaid` | code | Mermaid flowchart diagram |

## Custom Targets

```typescript
import { createTarget, OrgChartCompiler } from '@parallax/org-chart-compiler';

const pythonTarget = createTarget({
  name: 'python',
  format: 'code',

  emitHeader: (pattern) => `# ${pattern.name}\n`,

  emitRole: (role, id) => `agent_${id} = Agent("${id}", ${JSON.stringify(role.capabilities)})`,

  emitWorkflow: (workflow, ctx) => `def ${workflow.name}():\n    pass`,

  emitStep: (step, idx) => `    # Step ${idx}: ${step.type}`,

  join: (parts) => parts.join('\n'),
});

OrgChartCompiler.registerTarget(pythonTarget);

const result = OrgChartCompiler.compile(pattern, { target: 'python' });
```

## Workflow Step Types

| Type | Description |
|------|-------------|
| `assign` | Assign a task to a role |
| `parallel` | Execute steps concurrently |
| `sequential` | Execute steps in order |
| `select` | Select an agent from a role |
| `review` | Request review from a role |
| `approve` | Request approval from a role |
| `aggregate` | Aggregate multiple results |
| `condition` | Conditional branching |
| `wait` | Wait for condition or timeout |

## Aggregation Methods

| Method | Description |
|--------|-------------|
| `consensus` | Most common result |
| `majority` | Result with >50% agreement |
| `merge` | Merge all results |
| `best` | Highest confidence result |
| `custom` | Custom aggregation function |

## License

MIT
