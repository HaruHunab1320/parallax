/**
 * Generic Node Component
 *
 * Fallback for node types without custom components
 */

import React from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';

export function GenericNode(props: BaseNodeProps) {
  const { data } = props;

  return (
    <BaseNode {...props} headerColor="bg-slate-600">
      <div className="text-xs text-slate-500">
        {data.description || 'Configure in properties panel'}
      </div>
    </BaseNode>
  );
}

export default GenericNode;
