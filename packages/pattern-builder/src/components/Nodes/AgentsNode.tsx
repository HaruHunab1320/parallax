/**
 * Agents Node Component
 *
 * Configures agent selection criteria
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';
import { AgentsNodeData } from '../../types';

export function AgentsNode(props: BaseNodeProps) {
  const data = props.data as AgentsNodeData;
  const capabilities = data.capabilities || [];

  return (
    <BaseNode {...props} headerColor="bg-blue-600">
      <div className="space-y-2">
        {/* Capabilities */}
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            Capabilities
          </div>
          {capabilities.length === 0 ? (
            <div className="text-slate-400 italic text-xs">None specified</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {capabilities.map((cap, index) => (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]"
                >
                  {cap}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Agent count */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Min agents:</span>
          <span className="font-semibold">{data.minAgents || 1}</span>
          {data.maxAgents && (
            <>
              <span className="text-slate-400">Max:</span>
              <span className="font-semibold">{data.maxAgents}</span>
            </>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

export default AgentsNode;
