/**
 * @parallax/pattern-builder
 *
 * Visual pattern builder for Parallax orchestration patterns
 */

// Main component
export { PatternBuilder } from './components/PatternBuilder';
export type { PatternBuilderProps } from './components/PatternBuilder';

// Canvas components
export { Canvas } from './components/Canvas/Canvas';

// Node components
export {
  BaseNode,
  InputNode,
  OutputNode,
  AgentsNode,
  ParallelNode,
  ConsensusNode,
  ThresholdNode,
  GenericNode,
  nodeTypes,
} from './components/Nodes';

// Panel components
export { NodePalette } from './components/Palette/NodePalette';
export { PropertiesPanel } from './components/Panels/PropertiesPanel';

// Hooks
export { usePatternStore } from './hooks/usePatternStore';
export type { PatternBuilderState } from './hooks/usePatternStore';

// Types
export * from './types';

// Example patterns
export { EXAMPLE_PATTERNS, getPatternById, getPatternsByCategory } from './data/example-patterns';
export type { ExamplePattern } from './data/example-patterns';
