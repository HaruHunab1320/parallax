/**
 * Spawn Thread Tool - Creates a new managed thread
 */

import type {
  SpawnThreadInput as RuntimeSpawnThreadInput,
  ThreadHandle,
  ThreadRuntimeProvider,
} from '@parallaxai/runtime-interface';
import type { LocalRuntime } from '@parallaxai/runtime-local';
import { type SpawnThreadInput, SpawnThreadInputSchema } from './schemas.js';

export const SPAWN_THREAD_TOOL = {
  name: 'spawn_thread',
  description:
    'Create and start a new managed thread. Returns the thread handle with ID and status.',
  inputSchema: SpawnThreadInputSchema,
};

export async function executeSpawnThread(
  runtime: LocalRuntime,
  input: SpawnThreadInput
): Promise<
  { success: true; thread: ThreadHandle } | { success: false; error: string }
> {
  try {
    const threadRuntime = runtime as LocalRuntime & ThreadRuntimeProvider;
    const spawnInput: RuntimeSpawnThreadInput = {
      executionId: input.executionId,
      name: input.name,
      agentType: input.agentType,
      objective: input.objective,
      role: input.role,
      preparation: {
        workspace:
          input.workspacePath || input.workspaceRepo || input.workspaceBranch
            ? {
                path: input.workspacePath,
                repo: input.workspaceRepo,
                branch: input.workspaceBranch,
              }
            : undefined,
        env: input.env,
        approvalPreset: input.approvalPreset,
      },
      metadata: input.metadata,
    };

    const thread = await threadRuntime.spawnThread(spawnInput);
    return { success: true, thread };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
