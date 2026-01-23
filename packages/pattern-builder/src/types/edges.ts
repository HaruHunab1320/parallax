/**
 * Edge type definitions for the Pattern Builder
 */

import { Edge, MarkerType } from '@xyflow/react';

// Edge types
export type PatternEdgeType = 'default' | 'confidence' | 'conditional';

// Base edge data - index signature for React Flow compatibility
export interface BaseEdgeData {
  label?: string;
  confidence?: number;
  [key: string]: unknown;
}

// Confidence edge - shows confidence flow
export interface ConfidenceEdgeData extends BaseEdgeData {
  confidence: number;
  propagation: 'average' | 'min' | 'max' | 'weighted';
}

// Conditional edge - for branches
export interface ConditionalEdgeData extends BaseEdgeData {
  condition: 'true' | 'false';
}

// Union type for edge data
export type PatternEdgeData = BaseEdgeData | ConfidenceEdgeData | ConditionalEdgeData;

// Typed edge for React Flow
export type PatternEdge = Edge<PatternEdgeData, PatternEdgeType>;

// Default edge options
export const DEFAULT_EDGE_OPTIONS = {
  type: 'confidence' as PatternEdgeType,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
  },
  style: {
    strokeWidth: 2,
  },
};

// Get edge color based on confidence
export function getEdgeColor(confidence?: number): string {
  if (confidence === undefined) return '#94a3b8'; // slate-400
  if (confidence >= 0.8) return '#22c55e'; // green-500
  if (confidence >= 0.6) return '#eab308'; // yellow-500
  if (confidence >= 0.4) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

// Get edge stroke width based on confidence
export function getEdgeWidth(confidence?: number): number {
  if (confidence === undefined) return 2;
  return 2 + (confidence * 3); // 2-5px based on confidence
}
