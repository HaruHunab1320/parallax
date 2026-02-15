/**
 * Send Tool - Send message to an agent
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import type { AgentMessage } from '@parallax/runtime-interface';
import { SendInputSchema, type SendInput } from './schemas.js';

export const SEND_TOOL = {
  name: 'send',
  description: 'Send a message to an agent. Optionally wait for a response.',
  inputSchema: SendInputSchema,
};

export async function executeSend(
  runtime: LocalRuntime,
  input: SendInput
): Promise<
  | { success: true; sent: true; response?: AgentMessage }
  | { success: false; error: string }
> {
  try {
    // Check if agent exists
    const agent = await runtime.get(input.agentId);
    if (!agent) {
      return { success: false, error: `Agent ${input.agentId} not found` };
    }

    const result = await runtime.send(input.agentId, input.message, {
      expectResponse: input.expectResponse,
      timeout: input.timeout,
    });

    if (input.expectResponse && result) {
      return { success: true, sent: true, response: result };
    }

    return { success: true, sent: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
