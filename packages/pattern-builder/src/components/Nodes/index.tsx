/**
 * Node Components Index
 *
 * Exports all custom node components and the nodeTypes map for React Flow
 */

export { BaseNode } from './BaseNode';
export type { BaseNodeProps } from './BaseNode';
export { InputNode } from './InputNode';
export { OutputNode } from './OutputNode';
export { AgentsNode } from './AgentsNode';
export { ParallelNode } from './ParallelNode';
export { ConsensusNode } from './ConsensusNode';
export { ThresholdNode } from './ThresholdNode';
export { GenericNode } from './GenericNode';

import { InputNode } from './InputNode';
import { OutputNode } from './OutputNode';
import { AgentsNode } from './AgentsNode';
import { ParallelNode } from './ParallelNode';
import { ConsensusNode } from './ConsensusNode';
import { ThresholdNode } from './ThresholdNode';
import { GenericNode } from './GenericNode';

/**
 * Node types map for React Flow
 * Maps node type strings to React components
 */
export const nodeTypes = {
  // Core nodes
  input: InputNode,
  output: OutputNode,
  agents: AgentsNode,

  // Execution nodes
  parallel: ParallelNode,
  sequential: GenericNode,
  race: GenericNode,

  // Aggregation nodes
  consensus: ConsensusNode,
  voting: GenericNode,
  merge: GenericNode,

  // Control nodes
  threshold: ThresholdNode,
  retry: GenericNode,
  fallback: GenericNode,
  delegate: GenericNode,

  // Logic nodes
  condition: GenericNode,
};
