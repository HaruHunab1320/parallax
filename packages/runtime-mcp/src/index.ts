/**
 * @parallaxai/runtime-mcp
 *
 * MCP (Model Context Protocol) server for Parallax Runtime.
 * Enables AI agents to spawn, manage, and communicate with other agents.
 *
 * @example
 * ```typescript
 * import { ParallaxMcpServer, StdioServerTransport } from '@parallaxai/runtime-mcp';
 * import pino from 'pino';
 *
 * const logger = pino();
 * const server = new ParallaxMcpServer({ logger });
 * const transport = new StdioServerTransport();
 *
 * await server.connect(transport);
 * ```
 */

// Main server
export { ParallaxMcpServer, type ParallaxMcpServerOptions } from './mcp-server.js';

// Transports
export { StdioServerTransport, SSEServerTransport } from './transports/index.js';

// Auth
export {
  McpAuthHandler,
  type McpAuthConfig,
  type ApiKeyConfig,
  type AuthContext,
  type AuthErrorCode,
  McpAuthError,
} from './auth/index.js';

// Tool schemas and executors
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
  SpawnThreadInputShape,
  StopThreadInputShape,
  ListThreadsInputShape,
  GetThreadInputShape,
  SendThreadInputShape,

  // Full Zod schemas (for validation)
  SpawnInputSchema,
  StopInputSchema,
  ListInputSchema,
  GetInputSchema,
  SendInputSchema,
  LogsInputSchema,
  MetricsInputSchema,
  HealthInputSchema,
  SpawnThreadInputSchema,
  StopThreadInputSchema,
  ListThreadsInputSchema,
  GetThreadInputSchema,
  SendThreadInputSchema,
  AgentTypeSchema,
  AgentStatusSchema,
  ThreadStatusSchema,

  // Types
  type SpawnInput,
  type StopInput,
  type ListInput,
  type GetInput,
  type SendInput,
  type LogsInput,
  type MetricsInput,
  type HealthInput,
  type SpawnThreadInput,
  type StopThreadInput,
  type ListThreadsInput,
  type GetThreadInput,
  type SendThreadInput,

  // Tool definitions
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
  ALL_TOOLS,

  // Executors
  executeSpawn,
  executeStop,
  executeList,
  executeGet,
  executeSend,
  executeLogs,
  executeMetrics,
  executeHealth,
  executeSpawnThread,
  executeStopThread,
  executeListThreads,
  executeGetThread,
  executeSendThreadInput,
} from './tools/index.js';

// Resource handlers
export {
  AGENT_RESOURCE_TEMPLATE,
  LOGS_RESOURCE_TEMPLATE,
  ALL_RESOURCE_TEMPLATES,
  parseAgentUri,
  parseLogsUri,
  listAgentResources,
  listLogsResources,
  readAgentResource,
  readLogsResource,
  subscribeLogsResource,
} from './resources/index.js';

// Prompt templates
export {
  SPAWN_REVIEW_TEAM_PROMPT,
  SPAWN_DEV_AGENT_PROMPT,
  ALL_PROMPTS,
  generateSpawnReviewTeamPrompt,
  generateSpawnDevAgentPrompt,
  type SpawnReviewTeamArgs,
  type SpawnDevAgentArgs,
} from './prompts/index.js';

// Re-export useful types from dependencies
export type { LocalRuntime } from '@parallaxai/runtime-local';
export type {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentMetrics,
  AgentStatus,
  AgentType,
  ThreadHandle,
  ThreadStatus,
} from '@parallaxai/runtime-interface';
