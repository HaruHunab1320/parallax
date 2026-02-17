/**
 * MCP Tool Definitions and Executors
 */

import { z } from 'zod';
import type { AgentManager } from '../agent-manager.js';
import type { AgentType, AgentStatus } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const AgentTypeSchema = z.enum(['claude', 'codex', 'gemini', 'aider', 'custom']);
export const AgentStatusSchema = z.enum([
  'pending', 'starting', 'authenticating', 'ready', 'busy', 'stopping', 'stopped', 'error'
]);

export const SpawnInputSchema = z.object({
  name: z.string().describe('Human-readable name for the agent'),
  type: AgentTypeSchema.describe('CLI agent type'),
  capabilities: z.array(z.string()).describe('List of capabilities'),
  role: z.string().optional().describe('Org role: architect, engineer, qa, etc.'),
  workdir: z.string().optional().describe('Working directory for the agent'),
  waitForReady: z.boolean().default(true).describe('Wait for agent to be ready'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  reportsTo: z.string().optional().describe('Agent ID this one reports to'),
  autoRestart: z.boolean().optional().describe('Restart on crash'),
  idleTimeout: z.number().optional().describe('Stop after N seconds idle'),
});

export const StopInputSchema = z.object({
  agentId: z.string().describe('ID of the agent to stop'),
  force: z.boolean().default(false).describe('Force kill instead of graceful shutdown'),
  timeout: z.number().optional().describe('Graceful shutdown timeout in milliseconds'),
});

export const ListInputSchema = z.object({
  status: z.union([AgentStatusSchema, z.array(AgentStatusSchema)]).optional(),
  type: z.union([AgentTypeSchema, z.array(AgentTypeSchema)]).optional(),
  role: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const GetInputSchema = z.object({
  agentId: z.string().describe('ID of the agent to retrieve'),
});

export const SendInputSchema = z.object({
  agentId: z.string().describe('ID of the agent to send to'),
  message: z.string().describe('Message content to send'),
  expectResponse: z.boolean().default(false).describe('Wait for a response'),
  timeout: z.number().optional().describe('Response timeout in milliseconds'),
});

export const LogsInputSchema = z.object({
  agentId: z.string().describe('ID of the agent'),
  tail: z.number().optional().describe('Number of lines from the end'),
});

export const MetricsInputSchema = z.object({
  agentId: z.string().describe('ID of the agent'),
});

export const HealthInputSchema = z.object({});

// Types
export type SpawnInput = z.infer<typeof SpawnInputSchema>;
export type StopInput = z.infer<typeof StopInputSchema>;
export type ListInput = z.infer<typeof ListInputSchema>;
export type GetInput = z.infer<typeof GetInputSchema>;
export type SendInput = z.infer<typeof SendInputSchema>;
export type LogsInput = z.infer<typeof LogsInputSchema>;
export type MetricsInput = z.infer<typeof MetricsInputSchema>;
export type HealthInput = z.infer<typeof HealthInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions (JSON Schema format for MCP)
// ─────────────────────────────────────────────────────────────────────────────

export const TOOLS = [
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
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool Executors
// ─────────────────────────────────────────────────────────────────────────────

export async function executeSpawn(manager: AgentManager, input: SpawnInput) {
  const validated = SpawnInputSchema.parse(input);
  const agent = await manager.spawn({
    name: validated.name,
    type: validated.type as AgentType,
    capabilities: validated.capabilities,
    role: validated.role,
    workdir: validated.workdir,
    env: validated.env,
    reportsTo: validated.reportsTo,
    autoRestart: validated.autoRestart,
    idleTimeout: validated.idleTimeout,
  });

  return {
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      capabilities: agent.capabilities,
      role: agent.role,
    },
  };
}

export async function executeStop(manager: AgentManager, input: StopInput) {
  const validated = StopInputSchema.parse(input);
  await manager.stop(validated.agentId, {
    force: validated.force,
    timeout: validated.timeout,
  });

  return { success: true, agentId: validated.agentId };
}

export async function executeList(manager: AgentManager, input: ListInput) {
  const validated = ListInputSchema.parse(input);
  const agents = await manager.list({
    status: validated.status as AgentStatus | AgentStatus[] | undefined,
    type: validated.type as AgentType | AgentType[] | undefined,
    role: validated.role,
    capabilities: validated.capabilities,
  });

  return {
    success: true,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      status: a.status,
      role: a.role,
      capabilities: a.capabilities,
    })),
    count: agents.length,
  };
}

export async function executeGet(manager: AgentManager, input: GetInput) {
  const validated = GetInputSchema.parse(input);
  const agent = await manager.get(validated.agentId);

  if (!agent) {
    return { success: false, error: `Agent not found: ${validated.agentId}` };
  }

  return { success: true, agent };
}

export async function executeSend(manager: AgentManager, input: SendInput) {
  const validated = SendInputSchema.parse(input);
  const message = await manager.send(validated.agentId, validated.message);

  return {
    success: true,
    message: {
      id: message.id,
      agentId: message.agentId,
      direction: message.direction,
      type: message.type,
      timestamp: message.timestamp,
    },
  };
}

export async function executeLogs(manager: AgentManager, input: LogsInput) {
  const validated = LogsInputSchema.parse(input);
  const lines: string[] = [];

  for await (const line of manager.logs(validated.agentId, { tail: validated.tail })) {
    lines.push(line);
  }

  return {
    success: true,
    agentId: validated.agentId,
    lines,
    count: lines.length,
  };
}

export async function executeMetrics(manager: AgentManager, input: MetricsInput) {
  const validated = MetricsInputSchema.parse(input);
  const metrics = await manager.metrics(validated.agentId);

  if (!metrics) {
    return { success: false, error: `Agent not found: ${validated.agentId}` };
  }

  return { success: true, agentId: validated.agentId, metrics };
}

export async function executeHealth(manager: AgentManager) {
  const health = await manager.getHealth();
  return { success: true, ...health };
}

// Tool permission mapping
export const TOOL_PERMISSIONS: Record<string, string> = {
  spawn: 'agents:spawn',
  stop: 'agents:stop',
  list: 'agents:list',
  get: 'agents:get',
  send: 'agents:send',
  logs: 'agents:logs',
  metrics: 'agents:metrics',
  health: 'health:check',
};
