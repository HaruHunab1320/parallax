/**
 * @parallaxai/org-chart-compiler
 *
 * DSL compiler for multi-agent organizational structures and workflows.
 */

// Main compiler
export { createTarget, OrgChartCompiler } from './compiler';
// Targets
export {
  buildJsonPlan,
  getTarget,
  jsonTarget,
  listTargets,
  mermaidTarget,
  prismTarget,
} from './targets';
// Types
export type {
  AggregateStep,
  ApproveStep,
  AssignStep,
  CompileContext,
  // Compilation types
  CompileOptions,
  CompileResult,
  CompileTarget,
  ConditionStep,
  EscalationConfig,
  // Pattern types
  OrgPattern,
  OrgRole,
  OrgStructure,
  OrgWorkflow,
  ParallelStep,
  PatternMetadata,
  ReviewStep,
  RoutingRule,
  SelectStep,
  SequentialStep,
  ValidationError,
  // Validation types
  ValidationResult,
  WaitStep,
  // Workflow step types
  WorkflowStep,
} from './types';
// Validation
export { validatePattern } from './validation/validator';
