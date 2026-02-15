/**
 * Spawn Tool - Creates a new agent
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import type { AgentConfig, AgentHandle } from '@parallax/runtime-interface';
import { SpawnInputSchema, type SpawnInput } from './schemas.js';

export const SPAWN_TOOL = {
  name: 'spawn',
  description: 'Create and start a new AI agent. Returns the agent handle with ID and status.',
  inputSchema: SpawnInputSchema,
};

export async function executeSpawn(
  runtime: LocalRuntime,
  input: SpawnInput
): Promise<{ success: true; agent: AgentHandle } | { success: false; error: string }> {
  try {
    const config: AgentConfig = {
      name: input.name,
      type: input.type,
      capabilities: input.capabilities,
      role: input.role,
      workdir: input.workdir,
      env: input.env,
      reportsTo: input.reportsTo,
      autoRestart: input.autoRestart,
      idleTimeout: input.idleTimeout,
    };

    const agent = await runtime.spawn(config);

    // Optionally wait for ready state
    if (input.waitForReady && agent.status !== 'ready') {
      const readyAgent = await waitForReady(runtime, agent.id, 60000);
      return { success: true, agent: readyAgent };
    }

    return { success: true, agent };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function waitForReady(
  runtime: LocalRuntime,
  agentId: string,
  timeoutMs: number
): Promise<AgentHandle> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const agent = await runtime.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.status === 'ready') {
      return agent;
    }

    if (agent.status === 'error' || agent.status === 'stopped') {
      throw new Error(`Agent ${agentId} failed to start: ${agent.error || agent.status}`);
    }

    // Poll every 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Return current state on timeout
  const agent = await runtime.get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }
  return agent;
}
