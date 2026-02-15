/**
 * Metrics Tool - Get agent metrics
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import type { AgentMetrics } from '@parallax/runtime-interface';
import { MetricsInputSchema, type MetricsInput } from './schemas.js';

export const METRICS_TOOL = {
  name: 'metrics',
  description: 'Get resource metrics for an agent (CPU, memory, uptime, etc.).',
  inputSchema: MetricsInputSchema,
};

export async function executeMetrics(
  runtime: LocalRuntime,
  input: MetricsInput
): Promise<{ success: true; metrics: AgentMetrics } | { success: false; error: string }> {
  try {
    // Check if agent exists
    const agent = await runtime.get(input.agentId);
    if (!agent) {
      return { success: false, error: `Agent ${input.agentId} not found` };
    }

    const metrics = await runtime.metrics(input.agentId);

    if (!metrics) {
      return { success: false, error: `No metrics available for agent ${input.agentId}` };
    }

    return { success: true, metrics };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
