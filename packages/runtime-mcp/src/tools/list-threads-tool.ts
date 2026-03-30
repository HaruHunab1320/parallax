/**
 * List Threads Tool - Query running managed threads
 */

import type {
  ThreadFilter,
  ThreadHandle,
  ThreadRuntimeProvider,
} from '@parallaxai/runtime-interface';
import type { LocalRuntime } from '@parallaxai/runtime-local';
import { type ListThreadsInput, ListThreadsInputSchema } from './schemas.js';

export const LIST_THREADS_TOOL = {
  name: 'list_threads',
  description:
    'List managed threads with optional filtering by execution, role, or status.',
  inputSchema: ListThreadsInputSchema,
};

export async function executeListThreads(
  runtime: LocalRuntime,
  input: ListThreadsInput
): Promise<
  { success: true; threads: ThreadHandle[] } | { success: false; error: string }
> {
  try {
    const threadRuntime = runtime as LocalRuntime & ThreadRuntimeProvider;
    const filter: ThreadFilter = {};

    if (input.executionId) {
      filter.executionId = input.executionId;
    }
    if (input.role) {
      filter.role = input.role;
    }
    if (input.status) {
      filter.status = input.status;
    }

    const threads = await threadRuntime.listThreads(filter);
    return { success: true, threads };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
