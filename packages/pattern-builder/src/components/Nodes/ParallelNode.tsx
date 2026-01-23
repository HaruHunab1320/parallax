/**
 * Parallel Node Component
 *
 * Run multiple agents simultaneously
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';
import { ParallelNodeData } from '../../types';

export function ParallelNode(props: BaseNodeProps) {
  const data = props.data as ParallelNodeData;

  return (
    <BaseNode {...props} headerColor="bg-amber-600">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Agents:</span>
          <span className="font-semibold">{data.agentCount || 3}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Wait for all:</span>
          <span className={data.waitForAll ? 'text-green-600' : 'text-slate-400'}>
            {data.waitForAll ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
    </BaseNode>
  );
}

export default ParallelNode;
