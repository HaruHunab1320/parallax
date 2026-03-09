/**
 * parallax-agent-runtime
 *
 * MCP server for AI agent orchestration. Enables AI assistants like Claude
 * to spawn, manage, and coordinate multiple AI coding agents through the
 * Model Context Protocol.
 *
 * Built on:
 * - pty-manager: PTY session management
 * - coding-agent-adapters: Claude, Gemini, Codex, Aider, Hermes adapters
 *
 * @example
 * ```typescript
 * import { ParallaxMcpServer, StdioServerTransport } from 'parallax-agent-runtime';
 * import pino from 'pino';
 *
 * const server = new ParallaxMcpServer({
 *   logger: pino(),
 *   maxAgents: 10,
 * });
 *
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
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

// Main server
export {
  ParallaxMcpServer,
  StdioServerTransport,
  type ParallaxMcpServerOptions,
} from './mcp-server.js';

// PTY preflight check (re-exported from pty-manager)
export { ensurePty } from 'pty-manager';

// Terminal output cleaning utilities
export {
  stripAnsi,
  cleanForChat,
  extractCompletionSummary,
  extractDevServerUrl,
} from './ansi-utils.js';

// Agent manager (for direct usage without MCP)
export {
  AgentManager,
  type AgentManagerOptions,
  type AgentManagerEvents,
  type AdapterHealth,
} from './agent-manager.js';

// Auth
export {
  McpAuthHandler,
  McpAuthError,
  type McpAuthConfig,
  type ApiKeyConfig,
  type AuthContext,
  type AuthErrorCode,
} from './auth/index.js';

// Tools
export {
  TOOLS,
  TOOL_PERMISSIONS,
  executeSpawn,
  executeStop,
  executeList,
  executeGet,
  executeSend,
  executeLogs,
  executeMetrics,
  executeHealth,
  executeProvisionWorkspace,
  executeFinalizeWorkspace,
  executeCleanupWorkspace,
  executeGetWorkspaceFiles,
  executeWriteWorkspaceFile,
  executeListPresets,
  executeGetPresetConfig,
  executeNotifyHookEvent,
  executeWriteRaw,
  executeGetHookConfig,
  executeAddWorktree,
  executeListWorktrees,
  executeRemoveWorktree,
  SpawnInputSchema,
  StopInputSchema,
  ListInputSchema,
  GetInputSchema,
  SendInputSchema,
  LogsInputSchema,
  MetricsInputSchema,
  HealthInputSchema,
  ProvisionWorkspaceInputSchema,
  FinalizeWorkspaceInputSchema,
  CleanupWorkspaceInputSchema,
  GetWorkspaceFilesInputSchema,
  WriteWorkspaceFileInputSchema,
  ListPresetsInputSchema,
  GetPresetConfigInputSchema,
  NotifyHookEventInputSchema,
  WriteRawInputSchema,
  GetHookConfigInputSchema,
  AddWorktreeInputSchema,
  ListWorktreesInputSchema,
  RemoveWorktreeInputSchema,
  ApprovalPresetSchema,
  type SpawnInput,
  type StopInput,
  type ListInput,
  type GetInput,
  type SendInput,
  type LogsInput,
  type MetricsInput,
  type HealthInput,
  type ProvisionWorkspaceInput,
  type FinalizeWorkspaceInput,
  type CleanupWorkspaceInput,
  type GetWorkspaceFilesInput,
  type WriteWorkspaceFileInput,
  type ListPresetsInput,
  type GetPresetConfigInput,
  type NotifyHookEventInput,
  type WriteRawInput,
  type GetHookConfigInput,
  type AddWorktreeInput,
  type ListWorktreesInput,
  type RemoveWorktreeInput,
} from './tools/index.js';

// Resources
export {
  listAgentResources,
  readAgentResource,
  listLogsResources,
  readLogsResource,
  type Resource,
  type ResourceContents,
} from './resources/index.js';

// Prompts
export {
  PROMPTS,
  generateSpawnReviewTeamPrompt,
  generateSpawnDevAgentPrompt,
  type SpawnReviewTeamArgs,
  type SpawnDevAgentArgs,
  type PromptDefinition,
  type PromptResult,
} from './prompts/index.js';

// Types
export type {
  AgentType,
  AgentStatus,
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentFilter,
  AgentMetrics,
  AgentCredentials,
  BlockingPromptInfo,
  AuthRequiredInfo,
  RuntimeEvent,
  MessageType,
  StallClassification,
  ToolRunningInfo,
  HookEventType,
  WorkspaceProvisionConfig,
} from './types.js';

// Convenient alias
export { ParallaxMcpServer as ParallaxAgentRuntime } from './mcp-server.js';
