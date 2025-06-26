import { ParallaxAgent as BaseAgent } from './agent-base';

/**
 * Main export for TypeScript SDK
 * Re-exports the base agent class for backward compatibility
 */
export { BaseAgent as ParallaxAgent };

/**
 * Helper type for agent results
 */
export interface AgentResult<T = any> {
  value: T;
  confidence: number;
  agent: string;
  reasoning?: string;
  uncertainties?: string[];
  timestamp: number;
}

/**
 * Convenience function to create agent results
 */
export function createResult<T>(
  value: T,
  confidence: number,
  agent: string,
  reasoning?: string,
  uncertainties?: string[]
): AgentResult<T> {
  return {
    value,
    confidence,
    agent,
    reasoning,
    uncertainties,
    timestamp: Date.now(),
  };
}