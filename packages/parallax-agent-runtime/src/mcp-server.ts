/**
 * Parallax MCP Server
 *
 * MCP server that provides AI agent management capabilities.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport as McpStdioTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';

import { AgentManager } from './agent-manager.js';
import {
  McpAuthHandler,
  McpAuthError,
  type McpAuthConfig,
  type AuthContext,
} from './auth/index.js';
import {
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
  type SpawnInput,
  type StopInput,
  type ListInput,
  type GetInput,
  type SendInput,
  type LogsInput,
  type MetricsInput,
  type ProvisionWorkspaceInput,
  type FinalizeWorkspaceInput,
  type CleanupWorkspaceInput,
} from './tools/index.js';
import {
  listAgentResources,
  readAgentResource,
  listLogsResources,
  readLogsResource,
} from './resources/index.js';
import {
  PROMPTS,
  generateSpawnReviewTeamPrompt,
  generateSpawnDevAgentPrompt,
  type SpawnReviewTeamArgs,
  type SpawnDevAgentArgs,
} from './prompts/index.js';

export interface ParallaxMcpServerOptions {
  logger: Logger;
  maxAgents?: number;
  auth?: McpAuthConfig;
}

export class ParallaxMcpServer {
  private server: Server;
  private manager: AgentManager;
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

    // Initialize agent manager
    this.manager = new AgentManager(this.logger, {
      maxAgents: options.maxAgents ?? 10,
    });

    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'parallax-agent-runtime',
        version: '0.3.0',
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
   * Authenticate a connection
   */
  async authenticate(token: string): Promise<AuthContext> {
    if (!this.authHandler) {
      return { type: 'custom', permissions: ['*'] };
    }

    const context = await this.authHandler.authenticate(token);
    this.authContext = context;
    this.logger.info({ userId: context.userId, type: context.type }, 'Authenticated');
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
   * Check permission
   */
  hasPermission(permission: string): boolean {
    if (!this.authHandler || !this.authContext) {
      return true;
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
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        this.checkToolPermission(name);

        let result: unknown;

        switch (name) {
          case 'spawn':
            result = await executeSpawn(this.manager, args as SpawnInput);
            break;
          case 'stop':
            result = await executeStop(this.manager, args as StopInput);
            break;
          case 'list':
            result = await executeList(this.manager, args as ListInput);
            break;
          case 'get':
            result = await executeGet(this.manager, args as GetInput);
            break;
          case 'send':
            result = await executeSend(this.manager, args as SendInput);
            break;
          case 'logs':
            result = await executeLogs(this.manager, args as LogsInput);
            break;
          case 'metrics':
            result = await executeMetrics(this.manager, args as MetricsInput);
            break;
          case 'health':
            result = await executeHealth(this.manager);
            break;
          case 'provision_workspace':
            result = await executeProvisionWorkspace(this.manager, args as ProvisionWorkspaceInput);
            break;
          case 'finalize_workspace':
            result = await executeFinalizeWorkspace(this.manager, args as FinalizeWorkspaceInput);
            break;
          case 'cleanup_workspace':
            result = await executeCleanupWorkspace(this.manager, args as CleanupWorkspaceInput);
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

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const agentResources = await listAgentResources(this.manager);
      const logsResources = await listLogsResources(this.manager);
      return { resources: [...agentResources, ...logsResources] };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri.startsWith('agents://')) {
        const result = await readAgentResource(this.manager, uri);
        if (!result) {
          throw new Error(`Resource not found: ${uri}`);
        }
        return result;
      }

      if (uri.startsWith('logs://')) {
        const result = await readLogsResource(this.manager, uri);
        if (!result) {
          throw new Error(`Resource not found: ${uri}`);
        }
        return result;
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    });

    // List prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: PROMPTS };
    });

    // Get prompt
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

    this.logger.info('MCP handlers registered');
  }

  /**
   * Connect to transport
   */
  async connect(transport: Transport): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected');
    }

    await this.manager.initialize();
    await this.server.connect(transport);
    this.connected = true;
    this.logger.info('MCP server connected');
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.server.close();
    await this.manager.shutdown(true);
    this.connected = false;
    this.authContext = null;
    this.logger.info('MCP server disconnected');
  }

  /**
   * Get the agent manager
   */
  getManager(): AgentManager {
    return this.manager;
  }

  /**
   * Get auth context
   */
  getAuthContext(): AuthContext | null {
    return this.authContext;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Re-export the MCP SDK transport for convenience
export { McpStdioTransport as StdioServerTransport };
