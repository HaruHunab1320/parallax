/**
 * Org-Chart Patterns Module
 *
 * Infrastructure for organizational structure orchestration of multi-agent systems.
 *
 * Architecture:
 *   Org-chart YAML → compiled OrgPattern → WorkflowExecutor
 *
 * The org-chart compiler translates declarative YAML patterns into an
 * executable OrgPattern that the WorkflowExecutor runs step by step.
 */

export {
  DecisionJournal,
  DecisionJournalMeta,
  DecisionJournalStores,
} from './decision-journal';
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
