# Org Chart Compiler Development Plan

**Package Name:** `@parallax/org-chart-compiler`
**Current Location:** `packages/control-plane/src/org-patterns/`
**Extraction Difficulty:** Medium-Hard
**Estimated Effort:** 2-3 weeks
**Phase:** 3 (Complex Systems)

## Overview

A DSL compiler for defining multi-agent organizational structures and workflows. Parses YAML/JSON definitions of team hierarchies, role assignments, and task workflows, then compiles them into executable code.

## Current Implementation

```
packages/control-plane/src/org-patterns/
├── org-chart-compiler.ts   # 525 lines - Main compiler
├── types.ts                # 270 lines - Type definitions
├── workflow-executor.ts    # Workflow execution
├── message-router.ts       # Message routing
└── index.ts
```

### Core Concepts

```yaml
# Example org-chart pattern
name: code-review-team
version: "1.0"

structure:
  name: Engineering Team
  roles:
    engineer:
      agentType: claude
      capabilities: [coding, testing]
      minInstances: 2
    reviewer:
      agentType: claude
      capabilities: [code-review]
      reportsTo: engineer
    lead:
      agentType: human
      singleton: true

workflow:
  name: code-review-workflow
  steps:
    - type: parallel
      steps:
        - type: assign
          role: engineer
          task: "Implement feature"
    - type: review
      reviewer: reviewer
      subject: ${step_0_result}
    - type: approve
      approver: lead
      subject: ${step_1_result}
    - type: aggregate
      method: consensus
```

### Current Compiler

```typescript
export class OrgChartCompiler {
  static compile(pattern: OrgPattern, options?: CompilerOptions): CompiledPattern
  static async compileFromFile(yamlPath: string, outputPath?: string): Promise<string>
  static loadFromFile(filePath: string): Promise<OrgPattern>
}

export interface CompiledPattern {
  name: string;
  script: string;  // Generated Prism code
  metadata: PatternMetadata;
}
```

## Target API

```typescript
// @parallax/org-chart-compiler

import {
  OrgChartCompiler,
  OrgPattern,
  WorkflowStep,
  CodeTarget
} from '@parallax/org-chart-compiler';

// Parse YAML to pattern object
const pattern = OrgChartCompiler.parse(`
  name: review-team
  structure:
    roles:
      engineer:
        capabilities: [coding]
      reviewer:
        capabilities: [review]
  workflow:
    steps:
      - type: assign
        role: engineer
        task: "Write code"
`);

// Validate pattern structure
const validation = OrgChartCompiler.validate(pattern);
if (!validation.valid) {
  console.error(validation.errors);
}

// Compile to different targets
const prismCode = OrgChartCompiler.compile(pattern, {
  target: 'prism',
  format: 'code'
});

const jsonPlan = OrgChartCompiler.compile(pattern, {
  target: 'json',
  format: 'plan'
});

// Use built-in targets or create custom ones
import { createTarget } from '@parallax/org-chart-compiler';

const pythonTarget = createTarget({
  name: 'python',
  emitRole: (role) => `agent = Agent("${role.id}", ${JSON.stringify(role.capabilities)})`,
  emitWorkflow: (workflow) => /* ... */,
  emitStep: (step) => /* ... */
});

const pythonCode = OrgChartCompiler.compile(pattern, { target: pythonTarget });

// Load from file
const patternFromFile = await OrgChartCompiler.loadFromFile('./patterns/team.yaml');

// Watch for changes (dev mode)
OrgChartCompiler.watch('./patterns/*.yaml', (pattern, event) => {
  console.log(`Pattern ${pattern.name} ${event}`);
});
```

## Development Phases

### Phase 1: Core Extraction (Week 1)

#### Day 1-2: Parser & Types
- [ ] Create package structure
- [ ] Extract type definitions
- [ ] Extract YAML/JSON parser
- [ ] Add schema validation (JSON Schema or Zod)
- [ ] Remove Parallax-specific types

```typescript
// Generic role definition (no agentType enum)
interface OrgRole {
  id: string;
  name?: string;
  type?: string;           // Generic, not AgentType
  capabilities: string[];
  reportsTo?: string;
  minInstances?: number;
  maxInstances?: number;
  singleton?: boolean;
  metadata?: Record<string, unknown>;
}
```

#### Day 3-4: Workflow Model
- [ ] Extract workflow step types
- [ ] Create step validation
- [ ] Add dependency resolution
- [ ] Extract variable interpolation (`${step_0_result}`)

#### Day 5: Pattern Validation
- [ ] Role reference validation
- [ ] Workflow step validation
- [ ] Circular dependency detection
- [ ] Type compatibility checks

### Phase 2: Compiler (Week 2)

#### Day 1-2: Target System
- [ ] Define `CompileTarget` interface
- [ ] Create target registry
- [ ] Build Prism target (default)
- [ ] Build JSON plan target

```typescript
interface CompileTarget {
  name: string;

  // Emit code/structure for each element
  emitHeader?(pattern: OrgPattern): string;
  emitRole(role: OrgRole): string;
  emitWorkflow(workflow: OrgWorkflow): string;
  emitStep(step: WorkflowStep, context: CompileContext): string;
  emitFooter?(pattern: OrgPattern): string;

  // Output format
  format: 'code' | 'json' | 'yaml';
}
```

#### Day 3-4: Code Generation
- [ ] Variable scoping and interpolation
- [ ] Step result references
- [ ] Parallel/sequential block generation
- [ ] Aggregation method compilation

#### Day 5: Custom Targets
- [ ] `createTarget()` factory
- [ ] Target composition helpers
- [ ] Output formatting options

### Phase 3: Testing & Polish (Week 3)

#### Day 1-2: Unit Tests
- [ ] Parser tests
- [ ] Validation tests
- [ ] Compilation tests for each target
- [ ] Variable interpolation tests

#### Day 3: Integration Tests
- [ ] Round-trip tests (parse → compile → parse)
- [ ] Complex pattern tests
- [ ] Error case coverage

#### Day 4-5: Documentation & Publish
- [ ] DSL reference documentation
- [ ] Target development guide
- [ ] Example patterns library
- [ ] npm publish

## Package Structure

```
@parallax/org-chart-compiler/
├── src/
│   ├── index.ts                    # Public exports
│   ├── compiler.ts                 # Main OrgChartCompiler class
│   ├── types.ts                    # TypeScript interfaces
│   ├── parser/
│   │   ├── yaml-parser.ts          # YAML parsing
│   │   ├── json-parser.ts          # JSON parsing
│   │   └── schema.ts               # Validation schema
│   ├── validation/
│   │   ├── validator.ts            # Pattern validation
│   │   ├── role-validator.ts       # Role validation
│   │   └── workflow-validator.ts   # Workflow validation
│   ├── compiler/
│   │   ├── context.ts              # Compilation context
│   │   ├── interpolation.ts        # Variable interpolation
│   │   └── step-compiler.ts        # Step compilation
│   └── targets/
│       ├── target.interface.ts     # Target interface
│       ├── target-registry.ts      # Built-in targets
│       ├── prism.target.ts         # Prism output
│       ├── json.target.ts          # JSON plan output
│       └── factory.ts              # createTarget()
├── tests/
│   ├── parser/
│   ├── validation/
│   ├── compiler/
│   └── targets/
├── examples/
│   ├── patterns/
│   │   ├── simple-team.yaml
│   │   ├── code-review.yaml
│   │   └── hierarchical.yaml
│   └── custom-target.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── LICENSE
```

## API Reference

### `OrgChartCompiler`

```typescript
class OrgChartCompiler {
  /** Parse YAML/JSON string to OrgPattern */
  static parse(input: string, format?: 'yaml' | 'json'): OrgPattern;

  /** Load pattern from file */
  static loadFromFile(path: string): Promise<OrgPattern>;

  /** Validate pattern structure */
  static validate(pattern: OrgPattern): ValidationResult;

  /** Compile pattern to target output */
  static compile(pattern: OrgPattern, options: CompileOptions): CompileResult;

  /** Compile from file directly */
  static compileFromFile(
    inputPath: string,
    options: CompileOptions
  ): Promise<CompileResult>;

  /** Watch patterns for changes */
  static watch(
    glob: string,
    callback: (pattern: OrgPattern, event: 'add' | 'change' | 'remove') => void
  ): Watcher;

  /** Register custom target */
  static registerTarget(target: CompileTarget): void;

  /** List available targets */
  static getTargets(): string[];
}
```

### `OrgPattern`

```typescript
interface OrgPattern {
  name: string;
  version?: string;
  description?: string;

  structure: OrgStructure;
  workflow: OrgWorkflow;

  metadata?: Record<string, unknown>;
}

interface OrgStructure {
  name: string;
  roles: Record<string, OrgRole>;
  routing?: RoutingRule[];
  escalation?: EscalationConfig;
}

interface OrgWorkflow {
  name: string;
  input?: Record<string, SchemaDefinition>;
  steps: WorkflowStep[];
  output?: string;
}
```

### `WorkflowStep`

```typescript
type WorkflowStep =
  | AssignStep
  | ParallelStep
  | SequentialStep
  | ReviewStep
  | ApproveStep
  | AggregateStep
  | ConditionStep
  | WaitStep;

interface AssignStep {
  type: 'assign';
  role: string;
  task: string;
  input?: Record<string, unknown>;
  timeout?: number;
}

interface ParallelStep {
  type: 'parallel';
  steps: WorkflowStep[];
  maxConcurrency?: number;
}

interface AggregateStep {
  type: 'aggregate';
  method: 'consensus' | 'majority' | 'merge' | 'best' | 'custom';
  sources?: string[];
  customFn?: string;
}

interface ConditionStep {
  type: 'condition';
  check: string;  // Expression
  then: WorkflowStep;
  else?: WorkflowStep;
}
```

### `CompileTarget`

```typescript
interface CompileTarget {
  name: string;
  format: 'code' | 'json' | 'yaml';

  /** Emit header (imports, setup) */
  emitHeader?(pattern: OrgPattern, ctx: CompileContext): string;

  /** Emit role definition */
  emitRole(role: OrgRole, ctx: CompileContext): string;

  /** Emit complete workflow */
  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string;

  /** Emit individual step */
  emitStep(step: WorkflowStep, ctx: CompileContext): string;

  /** Emit footer (exports, cleanup) */
  emitFooter?(pattern: OrgPattern, ctx: CompileContext): string;

  /** Join all parts */
  join(parts: string[]): string;
}

interface CompileContext {
  pattern: OrgPattern;
  target: string;
  variables: Map<string, string>;
  stepResults: Map<string, string>;
  indent: number;
}
```

## DSL Reference

### Role Definition

```yaml
roles:
  engineer:
    type: claude           # Agent/worker type
    capabilities:          # Required capabilities
      - coding
      - testing
    reportsTo: lead        # Reporting structure
    minInstances: 1        # Scaling config
    maxInstances: 5
    singleton: false       # If true, exactly one instance
    metadata:
      priority: high
```

### Workflow Steps

```yaml
workflow:
  steps:
    # Assign task to role
    - type: assign
      role: engineer
      task: "Implement the feature"
      input:
        context: ${input.context}

    # Parallel execution
    - type: parallel
      steps:
        - type: assign
          role: engineer
          task: "Write code"
        - type: assign
          role: tester
          task: "Write tests"

    # Sequential execution
    - type: sequential
      steps:
        - type: assign
          role: reviewer
          task: "Review code"
        - type: approve
          approver: lead
          subject: ${step_0_result}

    # Review with feedback loop
    - type: review
      reviewer: reviewer
      subject: ${step_0_result}
      maxIterations: 3

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
      method: consensus
      sources:
        - step_0_result
        - step_1_result
```

## Migration Guide

### Before (Parallax Internal)

```typescript
import { OrgChartCompiler } from '../org-patterns/org-chart-compiler';
import { OrgPattern } from '../org-patterns/types';

const pattern = await OrgChartCompiler.loadFromFile('./pattern.yaml');
const compiled = OrgChartCompiler.compile(pattern);
// compiled.script is Prism code
```

### After (@parallax/org-chart-compiler)

```typescript
import { OrgChartCompiler } from '@parallax/org-chart-compiler';

const pattern = await OrgChartCompiler.loadFromFile('./pattern.yaml');
const compiled = OrgChartCompiler.compile(pattern, {
  target: 'prism',  // or 'json', or custom target
  format: 'code'
});
```

## Dependencies

**Runtime:**
- `js-yaml` ^4.0.0 (YAML parsing)
- `zod` ^3.0.0 (schema validation)

**Development:**
- `typescript` ^5.0.0
- `vitest` ^2.0.0
- `tsup` (bundling)

## Built-in Targets

| Target | Output | Description |
|--------|--------|-------------|
| `prism` | Code | Parallax Prism DSL code |
| `json` | JSON | Execution plan as JSON |
| `yaml` | YAML | Normalized YAML output |
| `mermaid` | Code | Mermaid diagram |

## Success Criteria

- [ ] Clean DSL specification
- [ ] Pluggable target system
- [ ] 90%+ test coverage
- [ ] TypeScript types included
- [ ] Schema validation with helpful errors
- [ ] At least 3 built-in targets
- [ ] Custom target documentation
- [ ] Example pattern library
