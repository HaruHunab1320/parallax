/**
 * List Tool - Query running agents
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import type { AgentHandle, AgentFilter } from '@parallax/runtime-interface';
import { ListInputSchema, type ListInput } from './schemas.js';

export const LIST_TOOL = {
  name: 'list',
  description: 'List agents with optional filtering by status, type, role, or capabilities.',
  inputSchema: ListInputSchema,
};

export async function executeList(
  runtime: LocalRuntime,
  input: ListInput
): Promise<{ success: true; agents: AgentHandle[] } | { success: false; error: string }> {
  try {
    const filter: AgentFilter = {};

    if (input.status) {
      filter.status = input.status;
    }

    if (input.type) {
      filter.type = input.type;
    }

    if (input.role) {
      filter.role = input.role;
    }

    if (input.capabilities) {
      filter.capabilities = input.capabilities;
    }

    const agents = await runtime.list(filter);

    return { success: true, agents };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
