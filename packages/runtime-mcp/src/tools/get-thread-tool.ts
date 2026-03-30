/**
 * Get Thread Tool - Get thread details
 */

import type {
  ThreadHandle,
  ThreadRuntimeProvider,
} from '@parallaxai/runtime-interface';
import type { LocalRuntime } from '@parallaxai/runtime-local';
import { type GetThreadInput, GetThreadInputSchema } from './schemas.js';

export const GET_THREAD_TOOL = {
  name: 'get_thread',
  description:
    'Get detailed information about a specific managed thread by ID.',
  inputSchema: GetThreadInputSchema,
};

export async function executeGetThread(
  runtime: LocalRuntime,
  input: GetThreadInput
): Promise<
  { success: true; thread: ThreadHandle } | { success: false; error: string }
> {
  try {
    const threadRuntime = runtime as LocalRuntime & ThreadRuntimeProvider;
    const thread = await threadRuntime.getThread(input.threadId);
    if (!thread) {
      return { success: false, error: `Thread ${input.threadId} not found` };
    }

    return { success: true, thread };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
