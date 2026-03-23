#!/usr/bin/env tsx
/**
 * Swarm MCP Entrypoint
 *
 * Standalone process spawned by Claude Code (or other MCP clients) to provide
 * swarm coordination tools. Communicates with the swarm agent via a shared
 * JSON state file in the workspace.
 *
 * Environment:
 *   PARALLAX_THREAD_ID       — this thread's ID
 *   PARALLAX_EXECUTION_ID    — execution ID
 *   PARALLAX_ROLE            — this agent's role (architect, engineer_a, etc.)
 *   PARALLAX_WORKSPACE_DIR   — workspace directory (contains .parallax-swarm/)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const THREAD_ID = process.env.PARALLAX_THREAD_ID || 'unknown';
const EXECUTION_ID = process.env.PARALLAX_EXECUTION_ID || 'unknown';
const ROLE = process.env.PARALLAX_ROLE || 'unknown';
const WORKSPACE = process.env.PARALLAX_WORKSPACE_DIR || process.cwd();

const SWARM_DIR = path.join(WORKSPACE, '.parallax-swarm');
const STATE_FILE = path.join(SWARM_DIR, 'state.json');
const OUTBOX_FILE = path.join(SWARM_DIR, 'outbox.jsonl');

interface SwarmState {
  executionId: string;
  architectPlan?: string;
  sharedDecisions: Array<{
    from: string;
    decision: string;
    category?: string;
    timestamp: number;
  }>;
  siblings: Array<{
    threadId: string;
    role: string;
    agentType: string;
    status: string;
    objective?: string;
  }>;
}

function readState(): SwarmState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // Corrupted state file
  }
  return {
    executionId: EXECUTION_ID,
    sharedDecisions: [],
    siblings: [],
  };
}

function appendOutbox(message: {
  type: string;
  from: string;
  threadId: string;
  data: any;
}): void {
  mkdirSync(SWARM_DIR, { recursive: true });
  const line = JSON.stringify({ ...message, timestamp: Date.now() }) + '\n';
  writeFileSync(OUTBOX_FILE, line, { flag: 'a' });
}

const TOOLS = [
  {
    name: 'ask_architect',
    description:
      'Escalate a question or decision to the architect (lead agent). ' +
      'Use when you need guidance on architecture, approach, or coordination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Your question for the architect' },
        context: { type: 'string', description: 'Context about what you are working on' },
      },
      required: ['question'],
    },
  },
  {
    name: 'share_decision',
    description:
      'Broadcast a key decision to all other agents. Use when you make a significant ' +
      'choice that affects consistency (naming, API design, library, architecture).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        decision: { type: 'string', description: 'The decision and rationale' },
        category: {
          type: 'string',
          enum: ['architecture', 'naming', 'library', 'api_design', 'testing', 'other'],
        },
      },
      required: ['decision'],
    },
  },
  {
    name: 'get_sibling_status',
    description: 'See what other agents in the swarm are working on.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_shared_context',
    description:
      'Pull the full shared context — architect plan, shared decisions, sibling status.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

async function main() {
  const server = new Server(
    { name: 'parallax-swarm-coordination', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args = {} } = request.params;
    let result: any;

    switch (name) {
      case 'ask_architect': {
        // Write question to outbox for the swarm agent to pick up
        appendOutbox({
          type: 'ask_architect',
          from: ROLE,
          threadId: THREAD_ID,
          data: { question: args.question, context: args.context },
        });

        // Read response from state (the swarm agent will write it)
        // For now, return acknowledgment — async response pattern
        result = {
          status: 'question_sent',
          message: 'Question sent to architect. Check shared context for the response.',
          question: args.question,
        };
        break;
      }

      case 'share_decision': {
        const state = readState();
        const decision = {
          from: ROLE,
          decision: args.decision as string,
          category: args.category as string || 'other',
          timestamp: Date.now(),
        };
        state.sharedDecisions.push(decision);
        mkdirSync(SWARM_DIR, { recursive: true });
        writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

        // Also write to outbox for broadcast
        appendOutbox({
          type: 'share_decision',
          from: ROLE,
          threadId: THREAD_ID,
          data: decision,
        });

        result = { shared: true, decision: args.decision };
        break;
      }

      case 'get_sibling_status': {
        const state = readState();
        result = {
          myRole: ROLE,
          siblings: state.siblings.filter((s) => s.threadId !== THREAD_ID),
        };
        break;
      }

      case 'get_shared_context': {
        const state = readState();
        result = {
          executionId: state.executionId,
          myRole: ROLE,
          architectPlan: state.architectPlan || 'Not yet available',
          sharedDecisions: state.sharedDecisions,
          siblings: state.siblings.filter((s) => s.threadId !== THREAD_ID),
        };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Swarm MCP server error: ${err.message}\n`);
  process.exit(1);
});
