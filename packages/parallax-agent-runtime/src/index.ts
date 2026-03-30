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

// PTY preflight check (re-exported from pty-manager)
export { ensurePty } from 'pty-manager';
// Agent manager (for direct usage without MCP)
export {
  type AdapterHealth,
  AgentManager,
  type AgentManagerEvents,
  type AgentManagerOptions,
} from './agent-manager.js';

// Terminal output cleaning utilities
export {
  cleanForChat,
  extractCompletionSummary,
  extractDevServerUrl,
  stripAnsi,
} from './ansi-utils.js';
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
// Convenient alias
export {
  ParallaxMcpServer,
  ParallaxMcpServer as ParallaxAgentRuntime,
  type ParallaxMcpServerOptions,
  StdioServerTransport,
} from './mcp-server.js';
// Prompts
export {
  generateSpawnDevAgentPrompt,
  generateSpawnReviewTeamPrompt,
  PROMPTS,
  type PromptDefinition,
  type PromptResult,
  type SpawnDevAgentArgs,
  type SpawnReviewTeamArgs,
} from './prompts/index.js';
// Resources
export {
  listAgentResources,
  listLogsResources,
  type Resource,
  type ResourceContents,
  readAgentResource,
  readLogsResource,
} from './resources/index.js';
// Tools
export {
  type AddWorktreeInput,
  AddWorktreeInputSchema,
  ApprovalPresetSchema,
  type CleanupWorkspaceInput,
  CleanupWorkspaceInputSchema,
  executeAddWorktree,
  executeCleanupWorkspace,
  executeFinalizeWorkspace,
  executeGet,
  executeGetHookConfig,
  executeGetPresetConfig,
  executeGetWorkspaceFiles,
  executeHealth,
  executeList,
  executeListPresets,
  executeListWorktrees,
  executeLogs,
  executeMetrics,
  executeNotifyHookEvent,
  executeProvisionWorkspace,
  executeRemoveWorktree,
  executeSend,
  executeSpawn,
  executeStop,
  executeWriteRaw,
  executeWriteWorkspaceFile,
  type FinalizeWorkspaceInput,
  FinalizeWorkspaceInputSchema,
  type GetHookConfigInput,
  GetHookConfigInputSchema,
  type GetInput,
  GetInputSchema,
  type GetPresetConfigInput,
  GetPresetConfigInputSchema,
  type GetWorkspaceFilesInput,
  GetWorkspaceFilesInputSchema,
  type HealthInput,
  HealthInputSchema,
  type ListInput,
  ListInputSchema,
  type ListPresetsInput,
  ListPresetsInputSchema,
  type ListWorktreesInput,
  ListWorktreesInputSchema,
  type LogsInput,
  LogsInputSchema,
  type MetricsInput,
  MetricsInputSchema,
  type NotifyHookEventInput,
  NotifyHookEventInputSchema,
  type ProvisionWorkspaceInput,
  ProvisionWorkspaceInputSchema,
  type RemoveWorktreeInput,
  RemoveWorktreeInputSchema,
  type SendInput,
  SendInputSchema,
  type SpawnInput,
  SpawnInputSchema,
  type StopInput,
  StopInputSchema,
  TOOL_PERMISSIONS,
  TOOLS,
  type WriteRawInput,
  WriteRawInputSchema,
  type WriteWorkspaceFileInput,
  WriteWorkspaceFileInputSchema,
} from './tools/index.js';
// Types
export type {
  AgentConfig,
  AgentCredentials,
  AgentFilter,
  AgentHandle,
  AgentMessage,
  AgentMetrics,
  AgentStatus,
  AgentType,
  AuthRequiredInfo,
  BlockingPromptInfo,
  HookEventType,
  MessageType,
  RuntimeEvent,
  StallClassification,
  ToolRunningInfo,
  WorkspaceProvisionConfig,
} from './types.js';
