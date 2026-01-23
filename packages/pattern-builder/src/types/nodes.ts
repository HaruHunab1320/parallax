/**
 * Node type definitions for the Pattern Builder
 */

import { Node } from '@xyflow/react';

// All available node types
export type PatternNodeType =
  | 'input'
  | 'output'
  | 'agents'
  | 'parallel'
  | 'sequential'
  | 'consensus'
  | 'voting'
  | 'merge'
  | 'threshold'
  | 'race'
  | 'delegate'
  | 'retry'
  | 'fallback'
  | 'condition';

// Base data all nodes share - index signature for React Flow compatibility
export interface BaseNodeData {
  label: string;
  description?: string;
  confidence?: number;
  isValid?: boolean;
  errors?: string[];
  [key: string]: unknown;
}

// Input node - defines pattern inputs
export interface InputNodeData extends BaseNodeData {
  fields: InputField[];
}

export interface InputField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: unknown;
}

// Output node - defines pattern outputs
export interface OutputNodeData extends BaseNodeData {
  mappings: OutputMapping[];
}

export interface OutputMapping {
  name: string;
  reference: string; // e.g., "$validResults", "$consensus.result"
}

// Agents node - configures agent selection
export interface AgentsNodeData extends BaseNodeData {
  capabilities: string[];
  minAgents: number;
  maxAgents?: number;
}

// Parallel node - run agents simultaneously
export interface ParallelNodeData extends BaseNodeData {
  agentCount: number;
  waitForAll: boolean;
}

// Sequential node - run in order
export interface SequentialNodeData extends BaseNodeData {
  steps: string[];
}

// Consensus node - build agreement
export interface ConsensusNodeData extends BaseNodeData {
  threshold: number;
  minVotes?: number;
}

// Voting node - democratic decision
export interface VotingNodeData extends BaseNodeData {
  method: 'majority' | 'unanimous' | 'weighted';
  minVotes?: number;
}

// Merge node - combine results
export interface MergeNodeData extends BaseNodeData {
  strategy: 'merge' | 'concat' | 'deep';
  fields?: string[];
}

// Threshold node - quality gate
export interface ThresholdNodeData extends BaseNodeData {
  minConfidence: number;
  action: 'pass' | 'fail' | 'fallback';
}

// Race node - first response wins
export interface RaceNodeData extends BaseNodeData {
  timeout?: number;
  minConfidence?: number;
}

// Delegate node - assign to specialists
export interface DelegateNodeData extends BaseNodeData {
  assignmentStrategy: 'round-robin' | 'capability' | 'load';
}

// Retry node - retry on failure
export interface RetryNodeData extends BaseNodeData {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

// Fallback node - use backup
export interface FallbackNodeData extends BaseNodeData {
  fallbackType: 'agent' | 'default' | 'escalate';
  fallbackValue?: unknown;
  fallbackTarget?: string;
}

// Condition node - branch logic
export interface ConditionNodeData extends BaseNodeData {
  expression: string;
  trueLabel?: string;
  falseLabel?: string;
}

// Union type for all node data
export type PatternNodeData =
  | InputNodeData
  | OutputNodeData
  | AgentsNodeData
  | ParallelNodeData
  | SequentialNodeData
  | ConsensusNodeData
  | VotingNodeData
  | MergeNodeData
  | ThresholdNodeData
  | RaceNodeData
  | DelegateNodeData
  | RetryNodeData
  | FallbackNodeData
  | ConditionNodeData;

// Typed node for React Flow
export type PatternNode = Node<PatternNodeData, PatternNodeType>;

// Node category for palette organization
export type NodeCategory =
  | 'core'
  | 'execution'
  | 'aggregation'
  | 'control'
  | 'logic';

// Node definition for the palette
export interface NodeDefinition {
  type: PatternNodeType;
  label: string;
  description: string;
  category: NodeCategory;
  icon: string;
  defaultData: Partial<PatternNodeData>;
  inputs: number;  // Number of input handles
  outputs: number; // Number of output handles
}

// All node definitions
export const NODE_DEFINITIONS: NodeDefinition[] = [
  // Core nodes
  {
    type: 'input',
    label: 'Input',
    description: 'Define pattern inputs',
    category: 'core',
    icon: '→',
    defaultData: { label: 'Input', fields: [] },
    inputs: 0,
    outputs: 1,
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Define pattern outputs',
    category: 'core',
    icon: '←',
    defaultData: { label: 'Output', mappings: [] },
    inputs: 1,
    outputs: 0,
  },
  {
    type: 'agents',
    label: 'Agents',
    description: 'Configure agent selection',
    category: 'core',
    icon: '◉',
    defaultData: { label: 'Agents', capabilities: [], minAgents: 2 },
    inputs: 1,
    outputs: 1,
  },

  // Execution nodes
  {
    type: 'parallel',
    label: 'Parallel',
    description: 'Run agents simultaneously',
    category: 'execution',
    icon: '⫘',
    defaultData: { label: 'Parallel', agentCount: 3, waitForAll: true },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'sequential',
    label: 'Pipeline',
    description: 'Run agents in sequence',
    category: 'execution',
    icon: '→→',
    defaultData: { label: 'Pipeline', steps: [] },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'race',
    label: 'Race',
    description: 'First response wins',
    category: 'execution',
    icon: '🏁',
    defaultData: { label: 'Race', timeout: 30000 },
    inputs: 1,
    outputs: 1,
  },

  // Aggregation nodes
  {
    type: 'consensus',
    label: 'Consensus',
    description: 'Build agreement from results',
    category: 'aggregation',
    icon: '∩',
    defaultData: { label: 'Consensus', threshold: 0.8, minVotes: 2 },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'voting',
    label: 'Voting',
    description: 'Democratic decision-making',
    category: 'aggregation',
    icon: '✋',
    defaultData: { label: 'Voting', method: 'majority' },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Combine multiple results',
    category: 'aggregation',
    icon: '⊕',
    defaultData: { label: 'Merge', strategy: 'merge' },
    inputs: 1,
    outputs: 1,
  },

  // Control nodes
  {
    type: 'threshold',
    label: 'Quality Gate',
    description: 'Filter by confidence threshold',
    category: 'control',
    icon: '✓',
    defaultData: { label: 'Quality Gate', minConfidence: 0.7, action: 'pass' },
    inputs: 1,
    outputs: 2, // pass and fail outputs
  },
  {
    type: 'retry',
    label: 'Retry',
    description: 'Retry on failure',
    category: 'control',
    icon: '↻',
    defaultData: { label: 'Retry', maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'fallback',
    label: 'Fallback',
    description: 'Use backup on failure',
    category: 'control',
    icon: '↓',
    defaultData: { label: 'Fallback', fallbackType: 'default' },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'delegate',
    label: 'Delegate',
    description: 'Assign to specialists',
    category: 'control',
    icon: '↓',
    defaultData: { label: 'Delegate', assignmentStrategy: 'capability' },
    inputs: 1,
    outputs: 1,
  },

  // Logic nodes
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on condition',
    category: 'logic',
    icon: '?',
    defaultData: { label: 'Condition', expression: 'confidence > 0.8' },
    inputs: 1,
    outputs: 2, // true and false outputs
  },
];

// Helper to get node definition by type
export function getNodeDefinition(type: PatternNodeType): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find(def => def.type === type);
}

// Helper to get nodes by category
export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return NODE_DEFINITIONS.filter(def => def.category === category);
}
