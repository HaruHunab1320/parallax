/**
 * Swarm Coordination MCP Server
 *
 * A lightweight MCP server started per-thread that gives CLI agents (Claude Code,
 * Codex, Gemini) the ability to communicate with the swarm coordinator and siblings.
 *
 * Tools provided:
 *   - ask_architect: Escalate a question/decision to the lead agent
 *   - share_decision: Broadcast a key decision to all siblings
 *   - get_sibling_status: See what other agents in the swarm are doing
 *   - get_shared_context: Pull the latest shared decisions and context
 *
 * The server communicates back to the control plane via thread events on the
 * gateway stream that the swarm agent already has open.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import type {
  GatewayThreadEvent,
  GatewayThreadStatusUpdate,
} from '@parallaxai/sdk-typescript';

export interface SwarmContext {
  executionId: string;
  threadId: string;
  role: string;
  objective: string;
  siblings: Array<{
    threadId: string;
    role: string;
    agentType: string;
    status: string;
    lastDecision?: string;
  }>;
  sharedDecisions: Array<{
    from: string;
    decision: string;
    timestamp: number;
  }>;
  architectPlan?: string;
}

export interface SwarmCoordinationCallbacks {
  onAskArchitect: (question: string) => Promise<string>;
  onShareDecision: (decision: string) => void;
  onGetSiblingStatus: () => SwarmContext['siblings'];
  onGetSharedContext: () => SwarmContext;
}

const TOOLS = [
  {
    name: 'ask_architect',
    description:
      'Escalate a question or decision to the architect (lead agent). ' +
      'Use when you need guidance on architecture, approach, or coordination with other agents. ' +
      'Returns the architect\'s response.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The question or decision you need help with',
        },
        context: {
          type: 'string',
          description: 'Relevant context about what you\'re working on',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'share_decision',
    description:
      'Broadcast a key decision to all other agents in the swarm. ' +
      'Use when you make a significant choice (API design, naming convention, library choice) ' +
      'that other agents should know about to stay consistent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        decision: {
          type: 'string',
          description: 'The decision you made and why',
        },
        category: {
          type: 'string',
          enum: ['architecture', 'naming', 'library', 'api_design', 'testing', 'other'],
          description: 'Category of the decision',
        },
      },
      required: ['decision'],
    },
  },
  {
    name: 'get_sibling_status',
    description:
      'See what other agents in the swarm are currently working on. ' +
      'Returns the status, role, and latest decisions of each sibling agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_shared_context',
    description:
      'Pull the full shared context for this execution — the architect\'s plan, ' +
      'all shared decisions, and sibling statuses. Use at the start of your work ' +
      'or when you need to catch up on what the swarm has decided.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

export class SwarmCoordinationServer {
  private server: Server;
  private logger: Logger;

  constructor(
    private context: SwarmContext,
    private callbacks: SwarmCoordinationCallbacks,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'swarm-mcp' });

    this.server = new Server(
      {
        name: 'parallax-swarm-coordination',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        let result: unknown;

        switch (name) {
          case 'ask_architect': {
            const question = args.question as string;
            const ctx = args.context as string | undefined;
            const fullQuestion = ctx
              ? `[${this.context.role}] ${question}\n\nContext: ${ctx}`
              : `[${this.context.role}] ${question}`;

            this.logger.info(
              { threadId: this.context.threadId, question },
              'Agent asking architect'
            );

            const response = await this.callbacks.onAskArchitect(fullQuestion);
            result = { response };
            break;
          }

          case 'share_decision': {
            const decision = args.decision as string;
            const category = args.category as string || 'other';

            this.logger.info(
              { threadId: this.context.threadId, decision, category },
              'Agent sharing decision'
            );

            this.callbacks.onShareDecision(
              `[${this.context.role}/${category}] ${decision}`
            );
            result = { shared: true, decision };
            break;
          }

          case 'get_sibling_status': {
            const siblings = this.callbacks.onGetSiblingStatus();
            result = {
              myRole: this.context.role,
              siblings: siblings.filter(
                (s) => s.threadId !== this.context.threadId
              ),
            };
            break;
          }

          case 'get_shared_context': {
            const ctx = this.callbacks.onGetSharedContext();
            result = {
              executionId: ctx.executionId,
              myRole: this.context.role,
              myObjective: this.context.objective,
              architectPlan: ctx.architectPlan || 'Not yet available',
              sharedDecisions: ctx.sharedDecisions,
              siblings: ctx.siblings.filter(
                (s) => s.threadId !== this.context.threadId
              ),
            };
            break;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: msg }) },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server on stdio transport.
   * Returns a cleanup function.
   */
  async start(): Promise<() => Promise<void>> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info(
      { threadId: this.context.threadId, role: this.context.role },
      'Swarm coordination MCP server started'
    );

    return async () => {
      await this.server.close();
    };
  }

  /**
   * Update the shared context (called when new decisions arrive).
   */
  updateContext(update: Partial<SwarmContext>): void {
    if (update.sharedDecisions) {
      this.context.sharedDecisions = update.sharedDecisions;
    }
    if (update.siblings) {
      this.context.siblings = update.siblings;
    }
    if (update.architectPlan) {
      this.context.architectPlan = update.architectPlan;
    }
  }
}
