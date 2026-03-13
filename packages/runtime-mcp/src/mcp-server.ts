/**
 * Parallax MCP Server
 *
 * Main MCP server wrapper that integrates with LocalRuntime to provide
 * agent management capabilities to MCP clients (like Claude Desktop).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { LocalRuntime } from '@parallaxai/runtime-local';
import type { Logger } from 'pino';

// Auth
import { McpAuthHandler, type McpAuthConfig, type AuthContext, McpAuthError } from './auth/index.js';

// Tool executors
import {
  type SpawnInput,
  type StopInput,
  type ListInput,
  type GetInput,
  type SendInput,
  type LogsInput,
  type MetricsInput,
  type SpawnThreadInput,
  type StopThreadInput,
  type ListThreadsInput,
  type GetThreadInput,
  type SendThreadInput,
} from './tools/schemas.js';
import { executeSpawn } from './tools/spawn-tool.js';
import { executeStop } from './tools/stop-tool.js';
import { executeList } from './tools/list-tool.js';
import { executeGet } from './tools/get-tool.js';
import { executeSend } from './tools/send-tool.js';
import { executeLogs } from './tools/logs-tool.js';
import { executeMetrics } from './tools/metrics-tool.js';
import { executeHealth } from './tools/health-tool.js';
import { executeSpawnThread } from './tools/spawn-thread-tool.js';
import { executeStopThread } from './tools/stop-thread-tool.js';
import { executeListThreads } from './tools/list-threads-tool.js';
import { executeGetThread } from './tools/get-thread-tool.js';
import { executeSendThreadInput } from './tools/send-thread-input-tool.js';

// Resources
import { listAgentResources, readAgentResource } from './resources/agent-resource.js';
import { listLogsResources, readLogsResource } from './resources/logs-resource.js';

// Prompts
import { generateSpawnReviewTeamPrompt, type SpawnReviewTeamArgs } from './prompts/spawn-review-team.js';
import { generateSpawnDevAgentPrompt, type SpawnDevAgentArgs } from './prompts/spawn-dev-agent.js';

export interface ParallaxMcpServerOptions {
  logger: Logger;
  maxAgents?: number;
  /**
   * Authentication configuration
   * If not provided, auth is disabled (suitable for local stdio transport)
   */
  auth?: McpAuthConfig;
}

// Tool to permission mapping
const TOOL_PERMISSIONS: Record<string, string> = {
  spawn: 'agents:spawn',
  stop: 'agents:stop',
  list: 'agents:list',
  get: 'agents:get',
  send: 'agents:send',
  logs: 'agents:logs',
  metrics: 'agents:metrics',
  health: 'health:check',
  spawn_thread: 'threads:spawn',
  stop_thread: 'threads:stop',
  list_threads: 'threads:list',
  get_thread: 'threads:get',
  send_thread_input: 'threads:send',
};

// Tool definitions with JSON schemas
const TOOLS = [
  {
    name: 'spawn',
    description: 'Create and start a new AI agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Human-readable name for the agent' },
        type: { type: 'string', enum: ['claude', 'codex', 'gemini', 'aider', 'custom'], description: 'CLI agent type' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'List of capabilities' },
        role: { type: 'string', description: 'Org role: architect, engineer, qa, etc.' },
        workdir: { type: 'string', description: 'Working directory for the agent' },
        waitForReady: { type: 'boolean', description: 'Wait for agent to be ready', default: true },
        env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Environment variables' },
        reportsTo: { type: 'string', description: 'Agent ID this one reports to' },
        autoRestart: { type: 'boolean', description: 'Restart on crash' },
        idleTimeout: { type: 'number', description: 'Stop after N seconds idle' },
      },
      required: ['name', 'type', 'capabilities'],
    },
  },
  {
    name: 'stop',
    description: 'Stop a running agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'ID of the agent to stop' },
        force: { type: 'boolean', description: 'Force kill instead of graceful shutdown', default: false },
        timeout: { type: 'number', description: 'Graceful shutdown timeout in milliseconds' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'list',
    description: 'List agents with optional filtering',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Filter by status' },
        type: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Filter by agent type' },
        role: { type: 'string', description: 'Filter by org role' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Filter by required capabilities' },
      },
    },
  },
  {
    name: 'get',
    description: 'Get detailed information about an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'ID of the agent to retrieve' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'send',
    description: 'Send a message to an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'ID of the agent to send to' },
        message: { type: 'string', description: 'Message content to send' },
        expectResponse: { type: 'boolean', description: 'Wait for a response', default: false },
        timeout: { type: 'number', description: 'Response timeout in milliseconds' },
      },
      required: ['agentId', 'message'],
    },
  },
  {
    name: 'logs',
    description: 'Get terminal output logs from an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'ID of the agent' },
        tail: { type: 'number', description: 'Number of lines from the end' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'metrics',
    description: 'Get resource metrics for an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'ID of the agent' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'health',
    description: 'Check the health status of the runtime',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'spawn_thread',
    description: 'Create and start a new managed thread',
    inputSchema: {
      type: 'object' as const,
      properties: {
        executionId: { type: 'string', description: 'Execution ID that owns the thread' },
        name: { type: 'string', description: 'Human-readable thread name' },
        agentType: { type: 'string', enum: ['claude', 'codex', 'gemini', 'aider', 'custom'], description: 'CLI agent type' },
        objective: { type: 'string', description: 'Objective for the thread to pursue' },
        role: { type: 'string', description: 'Optional orchestration role for the thread' },
        workspacePath: { type: 'string', description: 'Workspace path for the thread' },
        workspaceRepo: { type: 'string', description: 'Repository URL or slug for prepared workspace resolution' },
        workspaceBranch: { type: 'string', description: 'Branch name for the prepared workspace' },
        approvalPreset: { type: 'string', enum: ['readonly', 'standard', 'permissive', 'autonomous'], description: 'Approval preset controlling tool permissions' },
        env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Environment variables' },
        metadata: { type: 'object', additionalProperties: true, description: 'Additional thread metadata' },
      },
      required: ['executionId', 'name', 'agentType', 'objective'],
    },
  },
  {
    name: 'stop_thread',
    description: 'Stop a running managed thread',
    inputSchema: {
      type: 'object' as const,
      properties: {
        threadId: { type: 'string', description: 'ID of the thread to stop' },
        force: { type: 'boolean', description: 'Force kill instead of graceful shutdown', default: false },
        timeout: { type: 'number', description: 'Graceful shutdown timeout in milliseconds' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'list_threads',
    description: 'List managed threads with optional filtering',
    inputSchema: {
      type: 'object' as const,
      properties: {
        executionId: { type: 'string', description: 'Filter by execution ID' },
        role: { type: 'string', description: 'Filter by thread role' },
        status: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Filter by thread status' },
      },
    },
  },
  {
    name: 'get_thread',
    description: 'Get detailed information about a managed thread',
    inputSchema: {
      type: 'object' as const,
      properties: {
        threadId: { type: 'string', description: 'ID of the thread to retrieve' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'send_thread_input',
    description: 'Send message, raw terminal input, or key presses to a managed thread',
    inputSchema: {
      type: 'object' as const,
      properties: {
        threadId: { type: 'string', description: 'ID of the thread to send input to' },
        message: { type: 'string', description: 'Message content to send' },
        raw: { type: 'string', description: 'Raw bytes or terminal input to send' },
        keys: { type: 'array', items: { type: 'string' }, description: 'Key presses to send to the thread terminal' },
      },
      required: ['threadId'],
    },
  },
];

// Prompt definitions
const PROMPTS = [
  {
    name: 'spawn_review_team',
    description: 'Spawn a coordinated code review team',
    arguments: [
      { name: 'project_dir', description: 'Path to the project directory', required: true },
      { name: 'review_focus', description: 'Focus area for review', required: false },
    ],
  },
  {
    name: 'spawn_dev_agent',
    description: 'Quickly spawn a development agent for a task',
    arguments: [
      { name: 'task', description: 'Task description', required: true },
      { name: 'project_dir', description: 'Project directory', required: true },
      { name: 'agent_type', description: 'Agent type (claude, codex, gemini, aider)', required: false },
    ],
  },
];

export class ParallaxMcpServer {
  private server: Server;
  private runtime: LocalRuntime;
  private logger: Logger;
  private authHandler: McpAuthHandler | null = null;
  private authContext: AuthContext | null = null;
  private connected = false;

  constructor(options: ParallaxMcpServerOptions) {
    this.logger = options.logger;

    // Initialize auth handler if config provided
    if (options.auth) {
      this.authHandler = new McpAuthHandler(options.auth, this.logger);
    }

    // Initialize LocalRuntime
    this.runtime = new LocalRuntime(this.logger, {
      maxAgents: options.maxAgents ?? 10,
    });

    // Initialize MCP Server with lower-level API
    this.server = new Server(
      {
        name: 'parallax-runtime',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Authenticate a connection using a token
   * Call this before connect() when using HTTP/SSE transport
   *
   * @param token - Bearer token, API key, or custom token
   * @returns AuthContext on success
   * @throws McpAuthError on failure
   */
  async authenticate(token: string): Promise<AuthContext> {
    if (!this.authHandler) {
      // No auth configured, return permissive context
      return { type: 'custom', permissions: ['*'] };
    }

    const context = await this.authHandler.authenticate(token);
    this.authContext = context;
    this.logger.info({ userId: context.userId, type: context.type }, 'Connection authenticated');
    return context;
  }

  /**
   * Authenticate from Authorization header
   */
  async authenticateFromHeader(authHeader: string | undefined): Promise<AuthContext> {
    if (!this.authHandler) {
      return { type: 'custom', permissions: ['*'] };
    }

    const token = this.authHandler.extractToken(authHeader);
    if (!token) {
      throw new McpAuthError('No credentials provided', 'NO_CREDENTIALS');
    }

    return this.authenticate(token);
  }

  /**
   * Check if current connection has permission for an operation
   */
  hasPermission(permission: string): boolean {
    if (!this.authHandler || !this.authContext) {
      return true; // No auth configured
    }
    return this.authHandler.hasPermission(this.authContext, permission);
  }

  private checkToolPermission(toolName: string): void {
    const permission = TOOL_PERMISSIONS[toolName];
    if (permission && !this.hasPermission(permission)) {
      throw new McpAuthError(
        `Insufficient permissions for tool: ${toolName}`,
        'INSUFFICIENT_PERMISSIONS'
      );
    }
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        // Check permission
        this.checkToolPermission(name);

        let result: unknown;

        switch (name) {
          case 'spawn':
            result = await executeSpawn(this.runtime, args as SpawnInput);
            break;
          case 'stop':
            result = await executeStop(this.runtime, args as StopInput);
            break;
          case 'list':
            result = await executeList(this.runtime, args as ListInput);
            break;
          case 'get':
            result = await executeGet(this.runtime, args as GetInput);
            break;
          case 'send':
            result = await executeSend(this.runtime, args as SendInput);
            break;
          case 'logs':
            result = await executeLogs(this.runtime, args as LogsInput);
            break;
          case 'metrics':
            result = await executeMetrics(this.runtime, args as MetricsInput);
            break;
          case 'health':
            result = await executeHealth(this.runtime);
            break;
          case 'spawn_thread':
            result = await executeSpawnThread(this.runtime, args as SpawnThreadInput);
            break;
          case 'stop_thread':
            result = await executeStopThread(this.runtime, args as StopThreadInput);
            break;
          case 'list_threads':
            result = await executeListThreads(this.runtime, args as ListThreadsInput);
            break;
          case 'get_thread':
            result = await executeGetThread(this.runtime, args as GetThreadInput);
            break;
          case 'send_thread_input':
            result = await executeSendThreadInput(this.runtime, args as SendThreadInput);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof McpAuthError ? error.code : 'ERROR';

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: false, error: errorMessage, code: errorCode }),
            },
          ],
          isError: true,
        };
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const agentResources = await listAgentResources(this.runtime);
      const logsResources = await listLogsResources(this.runtime);
      return { resources: [...agentResources, ...logsResources] };
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri.startsWith('agents://')) {
        const result = await readAgentResource(this.runtime, uri);
        if (!result) {
          throw new Error(`Resource not found: ${uri}`);
        }
        return result;
      }

      if (uri.startsWith('logs://')) {
        const result = await readLogsResource(this.runtime, uri);
        if (!result) {
          throw new Error(`Resource not found: ${uri}`);
        }
        return result;
      }

      throw new Error(`Unknown resource URI scheme: ${uri}`);
    });

    // List prompts handler
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: PROMPTS };
    });

    // Get prompt handler
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      switch (name) {
        case 'spawn_review_team':
          return generateSpawnReviewTeamPrompt(args as unknown as SpawnReviewTeamArgs);
        case 'spawn_dev_agent':
          return generateSpawnDevAgentPrompt(args as unknown as SpawnDevAgentArgs);
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });

    this.logger.info('Registered MCP handlers');
  }

  /**
   * Connect to a transport and start serving
   */
  async connect(transport: Transport): Promise<void> {
    if (this.connected) {
      throw new Error('Server already connected');
    }

    // Initialize the runtime
    await this.runtime.initialize();
    this.logger.info('Runtime initialized');

    // Connect to transport
    await this.server.connect(transport);
    this.connected = true;
    this.logger.info('MCP server connected');
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.server.close();
    await this.runtime.shutdown(true);
    this.connected = false;
    this.authContext = null;
    this.logger.info('MCP server disconnected');
  }

  /**
   * Get the underlying runtime
   */
  getRuntime(): LocalRuntime {
    return this.runtime;
  }

  /**
   * Get current auth context (if authenticated)
   */
  getAuthContext(): AuthContext | null {
    return this.authContext;
  }

  /**
   * Check if server is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

export { StdioServerTransport };
