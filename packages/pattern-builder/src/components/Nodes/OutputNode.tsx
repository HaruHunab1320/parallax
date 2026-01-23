/**
 * Output Node Component
 *
 * Defines the output mapping for a pattern
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';
import { OutputNodeData } from '../../types';

export function OutputNode(props: BaseNodeProps) {
  const data = props.data as OutputNodeData;
  const mappings = data.mappings || [];

  return (
    <BaseNode {...props} headerColor="bg-violet-600">
      {mappings.length === 0 ? (
        <div className="text-slate-400 italic text-xs">No outputs defined</div>
      ) : (
        <div className="space-y-1">
          {mappings.map((mapping, index) => (
            <div key={index} className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className="font-mono bg-slate-100 px-1 rounded">
                {mapping.name}
              </span>
              <span className="text-slate-400">←</span>
              <span className="font-mono text-violet-600 text-[10px]">
                {mapping.reference}
              </span>
            </div>
          ))}
        </div>
      )}
    </BaseNode>
  );
}

export default OutputNode;
