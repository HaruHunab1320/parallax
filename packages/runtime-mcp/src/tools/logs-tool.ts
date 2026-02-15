/**
 * Logs Tool - Get agent logs
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import { LogsInputSchema, type LogsInput } from './schemas.js';

export const LOGS_TOOL = {
  name: 'logs',
  description: 'Get terminal output logs from an agent.',
  inputSchema: LogsInputSchema,
};

export async function executeLogs(
  runtime: LocalRuntime,
  input: LogsInput
): Promise<{ success: true; logs: string[] } | { success: false; error: string }> {
  try {
    // Check if agent exists
    const agent = await runtime.get(input.agentId);
    if (!agent) {
      return { success: false, error: `Agent ${input.agentId} not found` };
    }

    const logs: string[] = [];
    const logIterator = runtime.logs(input.agentId, { tail: input.tail });

    for await (const line of logIterator) {
      logs.push(line);
    }

    return { success: true, logs };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
