/**
 * Get Tool - Get agent details
 */

import type { AgentHandle } from '@parallaxai/runtime-interface';
import type { LocalRuntime } from '@parallaxai/runtime-local';
import { type GetInput, GetInputSchema } from './schemas.js';

export const GET_TOOL = {
  name: 'get',
  description: 'Get detailed information about a specific agent by ID.',
  inputSchema: GetInputSchema,
};

export async function executeGet(
  runtime: LocalRuntime,
  input: GetInput
): Promise<
  { success: true; agent: AgentHandle } | { success: false; error: string }
> {
  try {
    const agent = await runtime.get(input.agentId);

    if (!agent) {
      return { success: false, error: `Agent ${input.agentId} not found` };
    }

    return { success: true, agent };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
