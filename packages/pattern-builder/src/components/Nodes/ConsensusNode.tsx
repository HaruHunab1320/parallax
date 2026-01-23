/**
 * Consensus Node Component
 *
 * Build agreement from multiple results
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';
import { ConsensusNodeData } from '../../types';

export function ConsensusNode(props: BaseNodeProps) {
  const data = props.data as ConsensusNodeData;
  const threshold = data.threshold || 0.8;

  // Visual indicator of threshold
  const thresholdPercent = Math.round(threshold * 100);

  return (
    <BaseNode {...props} headerColor="bg-indigo-600">
      <div className="space-y-2">
        {/* Threshold bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Threshold</span>
            <span className="font-semibold">{thresholdPercent}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${thresholdPercent}%` }}
            />
          </div>
        </div>

        {/* Min votes */}
        {data.minVotes && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Min votes:</span>
            <span className="font-semibold">{data.minVotes}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default ConsensusNode;
