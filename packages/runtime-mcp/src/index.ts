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
// Re-export useful types from dependencies
export type { LocalRuntime } from '@parallaxai/runtime-local';

// Auth
export {
  type ApiKeyConfig,
  type AuthContext,
  type AuthErrorCode,
  type McpAuthConfig,
  McpAuthError,
  McpAuthHandler,
} from './auth/index.js';
// Main server
export {
  ParallaxMcpServer,
  type ParallaxMcpServerOptions,
} from './mcp-server.js';
// Prompt templates
export {
  ALL_PROMPTS,
  generateSpawnDevAgentPrompt,
  generateSpawnReviewTeamPrompt,
  SPAWN_DEV_AGENT_PROMPT,
  SPAWN_REVIEW_TEAM_PROMPT,
  type SpawnDevAgentArgs,
  type SpawnReviewTeamArgs,
} from './prompts/index.js';
// Resource handlers
export {
  AGENT_RESOURCE_TEMPLATE,
  ALL_RESOURCE_TEMPLATES,
  LOGS_RESOURCE_TEMPLATE,
  listAgentResources,
  listLogsResources,
  parseAgentUri,
  parseLogsUri,
  readAgentResource,
  readLogsResource,
  subscribeLogsResource,
} from './resources/index.js';
// Tool schemas and executors
export {
  AgentStatusSchema,
  AgentTypeSchema,
  ALL_TOOLS,
  executeGet,
  executeGetThread,
  executeHealth,
  executeList,
  executeListThreads,
  executeLogs,
  executeMetrics,
  executeSend,
  executeSendThreadInput,
  // Executors
  executeSpawn,
  executeSpawnThread,
  executeStop,
  executeStopThread,
  GET_THREAD_TOOL,
  GET_TOOL,
  type GetInput,
  GetInputSchema,
  GetInputShape,
  type GetThreadInput,
  GetThreadInputSchema,
  GetThreadInputShape,
  HEALTH_TOOL,
  type HealthInput,
  HealthInputSchema,
  HealthInputShape,
  LIST_THREADS_TOOL,
  LIST_TOOL,
  type ListInput,
  ListInputSchema,
  ListInputShape,
  type ListThreadsInput,
  ListThreadsInputSchema,
  ListThreadsInputShape,
  LOGS_TOOL,
  type LogsInput,
  LogsInputSchema,
  LogsInputShape,
  METRICS_TOOL,
  type MetricsInput,
  MetricsInputSchema,
  MetricsInputShape,
  SEND_THREAD_INPUT_TOOL,
  SEND_TOOL,
  type SendInput,
  SendInputSchema,
  SendInputShape,
  type SendThreadInput,
  SendThreadInputSchema,
  SendThreadInputShape,
  SPAWN_THREAD_TOOL,
  // Tool definitions
  SPAWN_TOOL,
  // Types
  type SpawnInput,
  // Full Zod schemas (for validation)
  SpawnInputSchema,
  // Schema shapes (for MCP SDK)
  SpawnInputShape,
  type SpawnThreadInput,
  SpawnThreadInputSchema,
  SpawnThreadInputShape,
  STOP_THREAD_TOOL,
  STOP_TOOL,
  type StopInput,
  StopInputSchema,
  StopInputShape,
  type StopThreadInput,
  StopThreadInputSchema,
  StopThreadInputShape,
  ThreadStatusSchema,
} from './tools/index.js';
// Transports
export {
  SSEServerTransport,
  StdioServerTransport,
} from './transports/index.js';
