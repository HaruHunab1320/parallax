/**
 * Input Node Component
 *
 * Defines the input schema for a pattern
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';
import { InputNodeData } from '../../types';

export function InputNode(props: BaseNodeProps) {
  const data = props.data as InputNodeData;
  const fields = data.fields || [];

  return (
    <BaseNode {...props} headerColor="bg-emerald-600">
      {fields.length === 0 ? (
        <div className="text-slate-400 italic text-xs">No fields defined</div>
      ) : (
        <div className="space-y-1">
          {fields.map((field, index) => (
            <div key={index} className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className="font-mono bg-slate-100 px-1 rounded">
                {field.name}
              </span>
              <span className="text-slate-400">{field.type}</span>
              {field.required && (
                <span className="text-red-500 text-[10px]">*</span>
              )}
            </div>
          ))}
        </div>
      )}
    </BaseNode>
  );
}

export default InputNode;
