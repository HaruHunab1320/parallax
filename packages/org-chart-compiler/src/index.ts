/**
 * @parallax/org-chart-compiler
 *
 * DSL compiler for multi-agent organizational structures and workflows.
 */

// Main compiler
export { OrgChartCompiler, createTarget } from './compiler';

// Validation
export { validatePattern } from './validation/validator';

// Targets
export {
  prismTarget,
  jsonTarget,
  mermaidTarget,
  buildJsonPlan,
  getTarget,
  listTargets,
} from './targets';

// Types
export type {
  // Pattern types
  OrgPattern,
  OrgStructure,
  OrgRole,
  OrgWorkflow,
  RoutingRule,
  EscalationConfig,

  // Workflow step types
  WorkflowStep,
  AssignStep,
  ParallelStep,
  SequentialStep,
  SelectStep,
  ReviewStep,
  ApproveStep,
  AggregateStep,
  ConditionStep,
  WaitStep,

  // Compilation types
  CompileOptions,
  CompileResult,
  CompileTarget,
  CompileContext,
  PatternMetadata,

  // Validation types
  ValidationResult,
  ValidationError,
} from './types';
