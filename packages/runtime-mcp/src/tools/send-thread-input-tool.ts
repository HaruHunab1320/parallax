/**
 * Send Thread Input Tool - Send terminal/message input to a managed thread
 */

import type { ThreadRuntimeProvider } from '@parallaxai/runtime-interface';
import type { LocalRuntime } from '@parallaxai/runtime-local';
import { type SendThreadInput, SendThreadInputSchema } from './schemas.js';

export const SEND_THREAD_INPUT_TOOL = {
  name: 'send_thread_input',
  description:
    'Send message, raw terminal input, or key presses to a managed thread.',
  inputSchema: SendThreadInputSchema,
};

export async function executeSendThreadInput(
  runtime: LocalRuntime,
  input: SendThreadInput
): Promise<{ success: true; sent: true } | { success: false; error: string }> {
  try {
    const threadRuntime = runtime as LocalRuntime & ThreadRuntimeProvider;
    const thread = await threadRuntime.getThread(input.threadId);
    if (!thread) {
      return { success: false, error: `Thread ${input.threadId} not found` };
    }

    await threadRuntime.sendToThread(input.threadId, {
      message: input.message,
      raw: input.raw,
      keys: input.keys,
    });

    return { success: true, sent: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
