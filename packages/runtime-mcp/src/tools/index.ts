/**
 * MCP Tools Index
 *
 * Exports all tool definitions and executors for the Parallax MCP server.
 */

export {
  // Schema shapes (for MCP SDK)
  SpawnInputShape,
  StopInputShape,
  ListInputShape,
  GetInputShape,
  SendInputShape,
  LogsInputShape,
  MetricsInputShape,
  HealthInputShape,

  // Full Zod schemas (for validation)
  SpawnInputSchema,
  StopInputSchema,
  ListInputSchema,
  GetInputSchema,
  SendInputSchema,
  LogsInputSchema,
  MetricsInputSchema,
  HealthInputSchema,

  // Enum schemas
  AgentTypeSchema,
  AgentStatusSchema,

  // Types
  type SpawnInput,
  type StopInput,
  type ListInput,
  type GetInput,
  type SendInput,
  type LogsInput,
  type MetricsInput,
  type HealthInput,
} from './schemas.js';

export { SPAWN_TOOL, executeSpawn } from './spawn-tool.js';
export { STOP_TOOL, executeStop } from './stop-tool.js';
export { LIST_TOOL, executeList } from './list-tool.js';
export { GET_TOOL, executeGet } from './get-tool.js';
export { SEND_TOOL, executeSend } from './send-tool.js';
export { LOGS_TOOL, executeLogs } from './logs-tool.js';
export { METRICS_TOOL, executeMetrics } from './metrics-tool.js';
export { HEALTH_TOOL, executeHealth } from './health-tool.js';

import { SPAWN_TOOL } from './spawn-tool.js';
import { STOP_TOOL } from './stop-tool.js';
import { LIST_TOOL } from './list-tool.js';
import { GET_TOOL } from './get-tool.js';
import { SEND_TOOL } from './send-tool.js';
import { LOGS_TOOL } from './logs-tool.js';
import { METRICS_TOOL } from './metrics-tool.js';
import { HEALTH_TOOL } from './health-tool.js';

/**
 * All available tools
 */
export const ALL_TOOLS = [
  SPAWN_TOOL,
  STOP_TOOL,
  LIST_TOOL,
  GET_TOOL,
  SEND_TOOL,
  LOGS_TOOL,
  METRICS_TOOL,
  HEALTH_TOOL,
] as const;
