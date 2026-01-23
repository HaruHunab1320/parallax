/**
 * Properties Panel Component
 *
 * Configure the selected node's properties
 */

import React from 'react';
import { clsx } from 'clsx';
import { usePatternStore } from '../../hooks/usePatternStore';
import {
  PatternNode,
  InputNodeData,
  OutputNodeData,
  AgentsNodeData,
  ConsensusNodeData,
  ThresholdNodeData,
  ParallelNodeData,
} from '../../types';

interface PropertiesPanelProps {
  className?: string;
}

export function PropertiesPanel({ className }: PropertiesPanelProps) {
  const { nodes, selectedNodeId, updateNode, removeNode } = usePatternStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div
        className={clsx(
          'bg-slate-50 border-l border-slate-200 p-4',
          className
        )}
      >
        <div className="text-sm text-slate-400 text-center mt-8">
          Select a node to edit its properties
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'bg-slate-50 border-l border-slate-200 p-4 overflow-y-auto',
        className
      )}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">
            {selectedNode.data.label}
          </h3>
          <button
            onClick={() => removeNode(selectedNode.id)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>

        {/* Common properties */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Label
          </label>
          <input
            type="text"
            value={selectedNode.data.label || ''}
            onChange={(e) =>
              updateNode(selectedNode.id, { label: e.target.value })
            }
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Type-specific properties */}
        <NodeProperties node={selectedNode} />
      </div>
    </div>
  );
}

function NodeProperties({ node }: { node: PatternNode }) {
  const { updateNode } = usePatternStore();

  switch (node.type) {
    case 'input':
      return <InputProperties node={node} updateNode={updateNode} />;
    case 'output':
      return <OutputProperties node={node} updateNode={updateNode} />;
    case 'agents':
      return <AgentsProperties node={node} updateNode={updateNode} />;
    case 'consensus':
      return <ConsensusProperties node={node} updateNode={updateNode} />;
    case 'threshold':
      return <ThresholdProperties node={node} updateNode={updateNode} />;
    case 'parallel':
      return <ParallelProperties node={node} updateNode={updateNode} />;
    default:
      return (
        <div className="text-xs text-slate-400">
          No additional properties for this node type.
        </div>
      );
  }
}

interface PropertyProps<T> {
  node: PatternNode;
  updateNode: (id: string, data: Partial<T>) => void;
}

function InputProperties({
  node,
  updateNode,
}: PropertyProps<InputNodeData>) {
  const data = node.data as InputNodeData;
  const fields = data.fields || [];

  const addField = () => {
    updateNode(node.id, {
      fields: [...fields, { name: 'newField', type: 'string', required: true }],
    });
  };

  const updateField = (index: number, updates: Partial<(typeof fields)[0]>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    updateNode(node.id, { fields: newFields });
  };

  const removeField = (index: number) => {
    updateNode(node.id, { fields: fields.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500">
          Input Fields
        </label>
        <button
          onClick={addField}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          + Add Field
        </button>
      </div>

      {fields.map((field, index) => (
        <div key={index} className="p-2 bg-white rounded border border-slate-200 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={field.name}
              onChange={(e) => updateField(index, { name: e.target.value })}
              placeholder="Field name"
              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
            />
            <select
              value={field.type}
              onChange={(e) => updateField(index, { type: e.target.value as any })}
              className="px-2 py-1 text-xs border border-slate-200 rounded"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="object">Object</option>
              <option value="array">Array</option>
            </select>
            <button
              onClick={() => removeField(index)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              ×
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => updateField(index, { required: e.target.checked })}
            />
            Required
          </label>
        </div>
      ))}
    </div>
  );
}

function OutputProperties({
  node,
  updateNode,
}: PropertyProps<OutputNodeData>) {
  const data = node.data as OutputNodeData;
  const mappings = data.mappings || [];

  const addMapping = () => {
    updateNode(node.id, {
      mappings: [...mappings, { name: 'result', reference: '$validResults' }],
    });
  };

  const updateMapping = (index: number, updates: Partial<(typeof mappings)[0]>) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    updateNode(node.id, { mappings: newMappings });
  };

  const removeMapping = (index: number) => {
    updateNode(node.id, { mappings: mappings.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500">
          Output Mappings
        </label>
        <button
          onClick={addMapping}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          + Add Mapping
        </button>
      </div>

      {mappings.map((mapping, index) => (
        <div key={index} className="p-2 bg-white rounded border border-slate-200 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={mapping.name}
              onChange={(e) => updateMapping(index, { name: e.target.value })}
              placeholder="Output name"
              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
            />
            <button
              onClick={() => removeMapping(index)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              ×
            </button>
          </div>
          <input
            type="text"
            value={mapping.reference}
            onChange={(e) => updateMapping(index, { reference: e.target.value })}
            placeholder="Reference (e.g., $validResults)"
            className="w-full px-2 py-1 text-xs border border-slate-200 rounded font-mono"
          />
        </div>
      ))}
    </div>
  );
}

function AgentsProperties({
  node,
  updateNode,
}: PropertyProps<AgentsNodeData>) {
  const data = node.data as AgentsNodeData;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Capabilities (comma-separated)
        </label>
        <input
          type="text"
          value={(data.capabilities || []).join(', ')}
          onChange={(e) =>
            updateNode(node.id, {
              capabilities: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder="analysis, validation"
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Min Agents
          </label>
          <input
            type="number"
            min={1}
            value={data.minAgents || 2}
            onChange={(e) =>
              updateNode(node.id, { minAgents: parseInt(e.target.value) || 1 })
            }
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Max Agents
          </label>
          <input
            type="number"
            min={1}
            value={data.maxAgents || ''}
            onChange={(e) =>
              updateNode(node.id, {
                maxAgents: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="Any"
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
          />
        </div>
      </div>
    </div>
  );
}

function ConsensusProperties({
  node,
  updateNode,
}: PropertyProps<ConsensusNodeData>) {
  const data = node.data as ConsensusNodeData;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Threshold ({Math.round((data.threshold || 0.8) * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={(data.threshold || 0.8) * 100}
          onChange={(e) =>
            updateNode(node.id, { threshold: parseInt(e.target.value) / 100 })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Min Votes
        </label>
        <input
          type="number"
          min={1}
          value={data.minVotes || ''}
          onChange={(e) =>
            updateNode(node.id, {
              minVotes: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          placeholder="No minimum"
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
        />
      </div>
    </div>
  );
}

function ThresholdProperties({
  node,
  updateNode,
}: PropertyProps<ThresholdNodeData>) {
  const data = node.data as ThresholdNodeData;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Min Confidence ({Math.round((data.minConfidence || 0.7) * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={(data.minConfidence || 0.7) * 100}
          onChange={(e) =>
            updateNode(node.id, { minConfidence: parseInt(e.target.value) / 100 })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          On Pass
        </label>
        <select
          value={data.action || 'pass'}
          onChange={(e) => updateNode(node.id, { action: e.target.value as any })}
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
        >
          <option value="pass">Continue</option>
          <option value="fail">Stop</option>
          <option value="fallback">Use Fallback</option>
        </select>
      </div>
    </div>
  );
}

function ParallelProperties({
  node,
  updateNode,
}: PropertyProps<ParallelNodeData>) {
  const data = node.data as ParallelNodeData;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Agent Count
        </label>
        <input
          type="number"
          min={2}
          value={data.agentCount || 3}
          onChange={(e) =>
            updateNode(node.id, { agentCount: parseInt(e.target.value) || 3 })
          }
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={data.waitForAll !== false}
          onChange={(e) => updateNode(node.id, { waitForAll: e.target.checked })}
        />
        Wait for all agents
      </label>
    </div>
  );
}

export default PropertiesPanel;
