/**
 * Org-Chart Patterns Module
 *
 * Infrastructure for organizational structure orchestration of multi-agent systems.
 *
 * Architecture:
 *   Pattern Builder (UI) → YAML → Prism → Execution
 *
 * The org-chart compiler translates declarative YAML patterns into executable
 * Prism scripts, ensuring a single execution engine while supporting multiple
 * input formats.
 */

export { MessageRouter, MessageRouterOptions } from './message-router';
export {
  CompiledPattern,
  CompilerOptions,
  compileOrgPattern,
  compileOrgPatternFile,
  loadOrgPatternFromFile,
} from './org-chart-compiler';
export * from './types';
export {
  WorkflowExecutor,
  WorkflowExecutorOptions,
  WorkflowResult,
} from './workflow-executor';
