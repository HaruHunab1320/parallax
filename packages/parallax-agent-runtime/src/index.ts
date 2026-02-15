/**
 * parallax-agent-runtime
 *
 * MCP server for AI agent orchestration. Enables AI assistants like Claude
 * to spawn, manage, and coordinate multiple AI agents through the Model
 * Context Protocol.
 *
 * @example
 * ```typescript
 * import { ParallaxAgentRuntime } from 'parallax-agent-runtime';
 * import pino from 'pino';
 *
 * const runtime = new ParallaxAgentRuntime({
 *   logger: pino(),
 *   maxAgents: 10,
 * });
 *
 * await runtime.start();
 * ```
 *
 * @example Claude Desktop Configuration
 * ```json
 * {
 *   "mcpServers": {
 *     "parallax": {
 *       "command": "npx",
 *       "args": ["parallax-agent-runtime"]
 *     }
 *   }
 * }
 * ```
 */

// Re-export everything from runtime-mcp
export {
  ParallaxMcpServer,
  type ParallaxMcpServerOptions,
  StdioServerTransport,
  SSEServerTransport,
  McpAuthHandler,
  type McpAuthConfig,
  type ApiKeyConfig,
  type AuthContext,
  type AuthErrorCode,
  McpAuthError,
  // Tool schemas
  SpawnInputSchema,
  StopInputSchema,
  ListInputSchema,
  GetInputSchema,
  SendInputSchema,
  LogsInputSchema,
  MetricsInputSchema,
  HealthInputSchema,
  type SpawnInput,
  type StopInput,
  type ListInput,
  type GetInput,
  type SendInput,
  type LogsInput,
  type MetricsInput,
  type HealthInput,
  // Tool executors
  executeSpawn,
  executeStop,
  executeList,
  executeGet,
  executeSend,
  executeLogs,
  executeMetrics,
  executeHealth,
  // Prompts
  generateSpawnReviewTeamPrompt,
  generateSpawnDevAgentPrompt,
  type SpawnReviewTeamArgs,
  type SpawnDevAgentArgs,
} from '@parallax/runtime-mcp';

// Re-export runtime types
export type {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentMetrics,
  AgentStatus,
  AgentType,
} from '@parallax/runtime-interface';

// Re-export LocalRuntime for advanced usage
export { LocalRuntime } from '@parallax/runtime-local';

// Convenient alias
export { ParallaxMcpServer as ParallaxAgentRuntime } from '@parallax/runtime-mcp';
