/**
 * Stop Thread Tool - Stops a running thread
 */

import type { ThreadRuntimeProvider } from '@parallaxai/runtime-interface';
import type { LocalRuntime } from '@parallaxai/runtime-local';
import { type StopThreadInput, StopThreadInputSchema } from './schemas.js';

export const STOP_THREAD_TOOL = {
  name: 'stop_thread',
  description: 'Stop a running managed thread.',
  inputSchema: StopThreadInputSchema,
};

export async function executeStopThread(
  runtime: LocalRuntime,
  input: StopThreadInput
): Promise<
  { success: true; threadId: string } | { success: false; error: string }
> {
  try {
    const threadRuntime = runtime as LocalRuntime & ThreadRuntimeProvider;
    const thread = await threadRuntime.getThread(input.threadId);
    if (!thread) {
      return { success: false, error: `Thread ${input.threadId} not found` };
    }

    await threadRuntime.stopThread(input.threadId, {
      force: input.force,
      timeout: input.timeout,
    });

    return { success: true, threadId: input.threadId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
