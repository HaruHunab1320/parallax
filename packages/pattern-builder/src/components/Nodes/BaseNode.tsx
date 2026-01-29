/**
 * Base Node Component
 *
 * Wraps all custom nodes with consistent styling and handles
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { clsx } from 'clsx';
import { PatternNodeData, getNodeDefinition, PatternNodeType } from '../../types';

// Simple props type that works with React Flow
export interface BaseNodeProps {
  id: string;
  data: PatternNodeData;
  selected?: boolean;
  type?: string;
  children?: React.ReactNode;
  className?: string;
  headerColor?: string;
}

export function BaseNode({
  id,
  data,
  selected,
  type,
  children,
  className,
  headerColor = 'bg-slate-600',
}: BaseNodeProps) {
  const definition = getNodeDefinition(type as PatternNodeType);
  const hasInputHandle = definition ? definition.inputs > 0 : true;
  const hasOutputHandle = definition ? definition.outputs > 0 : true;
  const handleStyle = {
    width: 14,
    height: 14,
    border: '2px solid #ffffff',
    background: '#94a3b8',
    boxShadow: '0 0 0 2px rgba(53, 181, 233, 0.15)',
  } as const;
  const handleOffset = -3;

  return (
    <div
      className={clsx(
        'relative overflow-visible rounded-lg shadow-lg bg-white border-2 min-w-[180px] w-fit',
        selected ? 'border-blue-500 shadow-blue-200' : 'border-slate-200',
        className
      )}
    >
      {/* Header */}
      <div
        className={clsx(
          'px-3 py-2 rounded-t-md flex items-center gap-2',
          headerColor
        )}
      >
        <span className="text-white text-lg">{definition?.icon || '◉'}</span>
        <span className="text-white font-medium text-sm truncate">
          {data.label}
        </span>
        {data.confidence !== undefined && (
          <span className="ml-auto text-white/80 text-xs">
            {Math.round(data.confidence * 100)}%
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 text-sm text-slate-700">{children}</div>

      {/* Input Handle */}
      {hasInputHandle && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            ...handleStyle,
            top: '50%',
            left: handleOffset,
            transform: 'translate(-50%, -50%)',
          }}
          className="w-3 h-3 bg-slate-400 border-2 border-white"
        />
      )}

      {/* Output Handle(s) */}
      {hasOutputHandle && definition?.outputs === 1 && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            ...handleStyle,
            top: '50%',
            right: handleOffset,
            transform: 'translate(50%, -50%)',
          }}
          className="w-3 h-3 bg-slate-400 border-2 border-white"
        />
      )}

      {/* Multiple output handles for conditional nodes */}
      {hasOutputHandle && definition?.outputs === 2 && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{
              ...handleStyle,
              top: '35%',
              right: handleOffset,
              transform: 'translate(50%, -50%)',
            }}
            className="w-3 h-3 bg-green-500 border-2 border-white"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{
              ...handleStyle,
              top: '65%',
              right: handleOffset,
              transform: 'translate(50%, -50%)',
            }}
            className="w-3 h-3 bg-red-500 border-2 border-white"
          />
        </>
      )}

      {/* Validation indicator */}
      {data.errors && data.errors.length > 0 && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">!</span>
        </div>
      )}
    </div>
  );
}

export default BaseNode;
