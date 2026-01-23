/**
 * Pattern Builder State Store
 *
 * Zustand store for managing the pattern builder state
 */

import { create } from 'zustand';
import {
  Connection,
  EdgeChange,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import {
  PatternNode,
  PatternEdge,
  PatternNodeType,
  PatternNodeData,
  PatternMetadata,
  ValidationError,
  ValidationWarning,
  getNodeDefinition,
  DEFAULT_EDGE_OPTIONS,
  InputNodeData,
  AgentsNodeData,
  OutputNodeData,
} from '../types';
import { ExamplePattern } from '../data/example-patterns';

export interface PatternBuilderState {
  // Pattern metadata
  metadata: PatternMetadata;

  // Flow state
  nodes: PatternNode[];
  edges: PatternEdge[];

  // Selection
  selectedNodeId: string | null;

  // Validation
  errors: ValidationError[];
  warnings: ValidationWarning[];
  isValid: boolean;

  // UI state
  isPanelOpen: boolean;
  isYamlPreviewOpen: boolean;

  // Actions - Metadata
  setMetadata: (metadata: Partial<PatternMetadata>) => void;

  // Actions - Nodes
  addNode: (type: PatternNodeType, position: { x: number; y: number }) => string;
  updateNode: (id: string, data: Partial<PatternNodeData>) => void;
  removeNode: (id: string) => void;
  onNodesChange: (changes: NodeChange<PatternNode>[]) => void;

  // Actions - Edges
  onEdgesChange: (changes: EdgeChange<PatternEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  // Actions - Selection
  selectNode: (id: string | null) => void;

  // Actions - Validation
  validate: () => boolean;
  clearErrors: () => void;

  // Actions - UI
  togglePanel: () => void;
  toggleYamlPreview: () => void;

  // Actions - Import/Export
  exportYaml: () => string;
  importYaml: (yaml: string) => void;
  loadPattern: (pattern: ExamplePattern) => void;
  reset: () => void;
}

const initialMetadata: PatternMetadata = {
  name: 'NewPattern',
  version: '1.0.0',
  description: 'A new orchestration pattern',
};

// Create initial nodes for a new pattern
const createInitialNodes = (): PatternNode[] => [
  {
    id: 'input-1',
    type: 'input',
    position: { x: 100, y: 200 },
    data: {
      label: 'Input',
      fields: [{ name: 'query', type: 'string', required: true }],
    },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 700, y: 200 },
    data: {
      label: 'Output',
      mappings: [{ name: 'result', reference: '$validResults' }],
    },
  },
];

export const usePatternStore = create<PatternBuilderState>((set, get) => ({
  // Initial state
  metadata: initialMetadata,
  nodes: createInitialNodes(),
  edges: [],
  selectedNodeId: null,
  errors: [],
  warnings: [],
  isValid: true,
  isPanelOpen: true,
  isYamlPreviewOpen: false,

  // Metadata actions
  setMetadata: (metadata) =>
    set((state) => ({
      metadata: { ...state.metadata, ...metadata },
    })),

  // Node actions
  addNode: (type, position) => {
    const definition = getNodeDefinition(type);
    if (!definition) {
      console.error(`Unknown node type: ${type}`);
      return '';
    }

    const id = `${type}-${nanoid(6)}`;
    const newNode: PatternNode = {
      id,
      type,
      position,
      data: {
        ...definition.defaultData,
        label: definition.label,
      } as PatternNodeData,
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      selectedNodeId: id,
    }));

    return id;
  },

  updateNode: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter(
        (edge) => edge.source !== id && edge.target !== id
      ),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    })),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    })),

  // Edge actions
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          ...DEFAULT_EDGE_OPTIONS,
          id: `edge-${nanoid(6)}`,
        },
        state.edges
      ),
    })),

  // Selection actions
  selectNode: (id) => set({ selectedNodeId: id }),

  // Validation actions
  validate: () => {
    const { nodes, edges } = get();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for input node
    const inputNodes = nodes.filter((n) => n.type === 'input');
    if (inputNodes.length === 0) {
      errors.push({
        message: 'Pattern must have an Input node',
        code: 'MISSING_INPUT',
      });
    }

    // Check for output node
    const outputNodes = nodes.filter((n) => n.type === 'output');
    if (outputNodes.length === 0) {
      errors.push({
        message: 'Pattern must have an Output node',
        code: 'MISSING_OUTPUT',
      });
    }

    // Check for disconnected nodes (except input/output)
    nodes.forEach((node) => {
      if (node.type === 'input') {
        const hasOutgoing = edges.some((e) => e.source === node.id);
        if (!hasOutgoing) {
          warnings.push({
            nodeId: node.id,
            message: 'Input node is not connected',
            code: 'DISCONNECTED_INPUT',
          });
        }
      } else if (node.type === 'output') {
        const hasIncoming = edges.some((e) => e.target === node.id);
        if (!hasIncoming) {
          warnings.push({
            nodeId: node.id,
            message: 'Output node is not connected',
            code: 'DISCONNECTED_OUTPUT',
          });
        }
      } else {
        const hasIncoming = edges.some((e) => e.target === node.id);
        const hasOutgoing = edges.some((e) => e.source === node.id);
        if (!hasIncoming || !hasOutgoing) {
          warnings.push({
            nodeId: node.id,
            message: `Node "${node.data.label}" is not fully connected`,
            code: 'DISCONNECTED_NODE',
          });
        }
      }
    });

    const isValid = errors.length === 0;

    set({ errors, warnings, isValid });
    return isValid;
  },

  clearErrors: () => set({ errors: [], warnings: [] }),

  // UI actions
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  toggleYamlPreview: () =>
    set((state) => ({ isYamlPreviewOpen: !state.isYamlPreviewOpen })),

  // Import/Export actions
  exportYaml: () => {
    const { metadata, nodes, edges } = get();
    // TODO: Implement proper YAML generation
    // For now, return a placeholder
    return generateYamlFromFlow(metadata, nodes, edges);
  },

  importYaml: (_yaml) => {
    // TODO: Implement YAML import
    console.warn('YAML import not yet implemented');
  },

  loadPattern: (pattern: ExamplePattern) => {
    // Generate unique IDs for nodes
    const nodeIds = pattern.nodes.map(() => nanoid());

    // Create nodes with unique IDs
    const nodes: PatternNode[] = pattern.nodes.map((node, index) => ({
      ...node,
      id: nodeIds[index],
    })) as PatternNode[];

    // Create edges using the node ID mapping
    const edges: PatternEdge[] = pattern.edges.map((edge, index) => ({
      id: `edge-${index}-${nanoid(6)}`,
      source: nodeIds[edge.source],
      target: nodeIds[edge.target],
      sourceHandle: edge.sourceHandle,
      type: 'default' as const,
      animated: true,
    }));

    // Update metadata
    const metadata: PatternMetadata = {
      name: pattern.name,
      version: '1.0.0',
      description: pattern.description,
    };

    set({
      metadata,
      nodes,
      edges,
      selectedNodeId: null,
      errors: [],
      warnings: [],
      isValid: true,
    });
  },

  reset: () =>
    set({
      metadata: initialMetadata,
      nodes: createInitialNodes(),
      edges: [],
      selectedNodeId: null,
      errors: [],
      warnings: [],
      isValid: true,
    }),
}));

/**
 * Generate YAML from flow state
 * This is a simplified implementation - will be expanded
 */
function generateYamlFromFlow(
  metadata: PatternMetadata,
  nodes: PatternNode[],
  _edges: PatternEdge[]
): string {
  const lines: string[] = [];

  // Metadata
  lines.push(`name: ${metadata.name}`);
  lines.push(`version: ${metadata.version}`);
  lines.push(`description: ${metadata.description}`);
  lines.push('');

  // Find input node
  const inputNode = nodes.find((n) => n.type === 'input');
  if (inputNode) {
    const inputData = inputNode.data as InputNodeData;
    if (inputData.fields && inputData.fields.length > 0) {
      lines.push('input:');
      for (const field of inputData.fields) {
        lines.push(`  ${field.name}: ${field.type}`);
      }
      lines.push('');
    }
  }

  // Find agents node
  const agentsNode = nodes.find((n) => n.type === 'agents');
  if (agentsNode) {
    const agentsData = agentsNode.data as AgentsNodeData;
    lines.push('agents:');
    lines.push(`  capabilities: [${(agentsData.capabilities || []).join(', ')}]`);
    lines.push(`  min: ${agentsData.minAgents || 1}`);
    lines.push('');
  }

  // Find aggregation nodes
  const consensusNode = nodes.find((n) => n.type === 'consensus');
  if (consensusNode && 'threshold' in consensusNode.data) {
    lines.push('aggregation:');
    lines.push('  strategy: consensus');
    lines.push(`  threshold: ${consensusNode.data.threshold}`);
    lines.push('');
  }

  const votingNode = nodes.find((n) => n.type === 'voting');
  if (votingNode && 'method' in votingNode.data) {
    lines.push('aggregation:');
    lines.push('  strategy: voting');
    lines.push(`  method: ${votingNode.data.method}`);
    lines.push('');
  }

  // Find output node
  const outputNode = nodes.find((n) => n.type === 'output');
  if (outputNode) {
    const outputData = outputNode.data as OutputNodeData;
    if (outputData.mappings && outputData.mappings.length > 0) {
      lines.push('output:');
      for (const mapping of outputData.mappings) {
        lines.push(`  ${mapping.name}: ${mapping.reference}`);
      }
      lines.push('');
    }
  }

  // Default confidence
  lines.push('confidence: average');

  return lines.join('\n');
}
