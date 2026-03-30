/**
 * MCP Tools Index
 *
 * Exports all tool definitions and executors for the Parallax MCP server.
 */

export { executeGetThread, GET_THREAD_TOOL } from './get-thread-tool.js';
export { executeGet, GET_TOOL } from './get-tool.js';
export { executeHealth, HEALTH_TOOL } from './health-tool.js';
export { executeListThreads, LIST_THREADS_TOOL } from './list-threads-tool.js';
export { executeList, LIST_TOOL } from './list-tool.js';
export { executeLogs, LOGS_TOOL } from './logs-tool.js';
export { executeMetrics, METRICS_TOOL } from './metrics-tool.js';
export {
  AgentStatusSchema,
  // Enum schemas
  AgentTypeSchema,
  type GetInput,
  GetInputSchema,
  GetInputShape,
  type GetThreadInput,
  GetThreadInputSchema,
  GetThreadInputShape,
  type HealthInput,
  HealthInputSchema,
  HealthInputShape,
  type ListInput,
  ListInputSchema,
  ListInputShape,
  type ListThreadsInput,
  ListThreadsInputSchema,
  ListThreadsInputShape,
  type LogsInput,
  LogsInputSchema,
  LogsInputShape,
  type MetricsInput,
  MetricsInputSchema,
  MetricsInputShape,
  type SendInput,
  SendInputSchema,
  SendInputShape,
  type SendThreadInput,
  SendThreadInputSchema,
  SendThreadInputShape,
  // Types
  type SpawnInput,
  // Full Zod schemas (for validation)
  SpawnInputSchema,
  // Schema shapes (for MCP SDK)
  SpawnInputShape,
  type SpawnThreadInput,
  SpawnThreadInputSchema,
  SpawnThreadInputShape,
  type StopInput,
  StopInputSchema,
  StopInputShape,
  type StopThreadInput,
  StopThreadInputSchema,
  StopThreadInputShape,
  ThreadStatusSchema,
} from './schemas.js';
export {
  executeSendThreadInput,
  SEND_THREAD_INPUT_TOOL,
} from './send-thread-input-tool.js';
export { executeSend, SEND_TOOL } from './send-tool.js';
export { executeSpawnThread, SPAWN_THREAD_TOOL } from './spawn-thread-tool.js';
export { executeSpawn, SPAWN_TOOL } from './spawn-tool.js';
export { executeStopThread, STOP_THREAD_TOOL } from './stop-thread-tool.js';
export { executeStop, STOP_TOOL } from './stop-tool.js';

import { GET_THREAD_TOOL } from './get-thread-tool.js';
import { GET_TOOL } from './get-tool.js';
import { HEALTH_TOOL } from './health-tool.js';
import { LIST_THREADS_TOOL } from './list-threads-tool.js';
import { LIST_TOOL } from './list-tool.js';
import { LOGS_TOOL } from './logs-tool.js';
import { METRICS_TOOL } from './metrics-tool.js';
import { SEND_THREAD_INPUT_TOOL } from './send-thread-input-tool.js';
import { SEND_TOOL } from './send-tool.js';
import { SPAWN_THREAD_TOOL } from './spawn-thread-tool.js';
import { SPAWN_TOOL } from './spawn-tool.js';
import { STOP_THREAD_TOOL } from './stop-thread-tool.js';
import { STOP_TOOL } from './stop-tool.js';

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
  SPAWN_THREAD_TOOL,
  STOP_THREAD_TOOL,
  LIST_THREADS_TOOL,
  GET_THREAD_TOOL,
  SEND_THREAD_INPUT_TOOL,
] as const;
