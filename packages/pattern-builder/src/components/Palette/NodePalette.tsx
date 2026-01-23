/**
 * Node Palette Component
 *
 * Draggable list of available nodes
 */

import React from 'react';
import { clsx } from 'clsx';
import {
  NODE_DEFINITIONS,
  NodeDefinition,
  NodeCategory,
  PatternNodeType,
} from '../../types';

interface NodePaletteProps {
  className?: string;
}

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  core: 'Core',
  execution: 'Execution',
  aggregation: 'Aggregation',
  control: 'Control',
  logic: 'Logic',
};

const CATEGORY_ORDER: NodeCategory[] = [
  'core',
  'execution',
  'aggregation',
  'control',
  'logic',
];

function PaletteItem({ definition }: { definition: NodeDefinition }) {
  const onDragStart = (
    event: React.DragEvent,
    nodeType: PatternNodeType
  ) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-2 p-2 rounded-md cursor-grab',
        'bg-white border border-slate-200',
        'hover:border-blue-300 hover:shadow-sm',
        'transition-all duration-150'
      )}
      draggable
      onDragStart={(e) => onDragStart(e, definition.type)}
    >
      <span className="text-lg w-6 text-center">{definition.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700 truncate">
          {definition.label}
        </div>
        <div className="text-[10px] text-slate-400 truncate">
          {definition.description}
        </div>
      </div>
    </div>
  );
}

export function NodePalette({ className }: NodePaletteProps) {
  const nodesByCategory = CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = NODE_DEFINITIONS.filter(
        (def) => def.category === category
      );
      return acc;
    },
    {} as Record<NodeCategory, NodeDefinition[]>
  );

  return (
    <div
      className={clsx(
        'bg-slate-50 border-r border-slate-200 p-3 overflow-y-auto',
        className
      )}
    >
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Nodes
      </div>

      <div className="space-y-4">
        {CATEGORY_ORDER.map((category) => (
          <div key={category}>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[category]}
            </div>
            <div className="space-y-1.5">
              {nodesByCategory[category].map((definition) => (
                <PaletteItem key={definition.type} definition={definition} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200">
        <div className="text-[10px] text-slate-400 text-center">
          Drag nodes onto the canvas
        </div>
      </div>
    </div>
  );
}

export default NodePalette;
