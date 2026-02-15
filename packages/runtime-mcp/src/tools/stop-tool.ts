/**
 * Stop Tool - Stops a running agent
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import { StopInputSchema, type StopInput } from './schemas.js';

export const STOP_TOOL = {
  name: 'stop',
  description: 'Stop a running agent. Can force kill or gracefully shutdown.',
  inputSchema: StopInputSchema,
};

export async function executeStop(
  runtime: LocalRuntime,
  input: StopInput
): Promise<{ success: true; agentId: string } | { success: false; error: string }> {
  try {
    // Check if agent exists
    const agent = await runtime.get(input.agentId);
    if (!agent) {
      return { success: false, error: `Agent ${input.agentId} not found` };
    }

    await runtime.stop(input.agentId, {
      force: input.force,
      timeout: input.timeout,
    });

    return { success: true, agentId: input.agentId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
