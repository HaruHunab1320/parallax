/**
 * Health Tool - Runtime health check
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import { HealthInputSchema } from './schemas.js';

export const HEALTH_TOOL = {
  name: 'health',
  description: 'Check the health status of the Parallax runtime.',
  inputSchema: HealthInputSchema,
};

export interface HealthResult {
  healthy: boolean;
  message?: string;
  runtime: string;
  agentCount: number;
  initialized: boolean;
}

export async function executeHealth(
  runtime: LocalRuntime
): Promise<{ success: true; health: HealthResult } | { success: false; error: string }> {
  try {
    const healthCheck = await runtime.healthCheck();
    const agents = await runtime.list();

    return {
      success: true,
      health: {
        healthy: healthCheck.healthy,
        message: healthCheck.message,
        runtime: runtime.name,
        agentCount: agents.length,
        initialized: true,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
