/**
 * Threshold Node Component (Quality Gate)
 *
 * Filter by confidence threshold
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';
import { ThresholdNodeData } from '../../types';

export function ThresholdNode(props: BaseNodeProps) {
  const data = props.data as ThresholdNodeData;
  const minConfidence = data.minConfidence || 0.7;
  const confidencePercent = Math.round(minConfidence * 100);

  return (
    <BaseNode {...props} headerColor="bg-teal-600">
      <div className="space-y-2">
        {/* Confidence threshold */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Min Confidence</span>
            <span className="font-semibold">{confidencePercent}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>

        {/* Output labels */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-slate-500">Pass</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-slate-500">Fail</span>
          </div>
        </div>
      </div>
    </BaseNode>
  );
}

export default ThresholdNode;
