/**
 * Zod schemas for MCP tool inputs
 *
 * These are "raw shapes" (objects with Zod fields) as expected by the MCP SDK,
 * not full ZodObject instances.
 */

import { z } from 'zod';

/**
 * Agent types supported by the runtime
 */
export const AgentTypeSchema = z.enum(['claude', 'codex', 'gemini', 'aider', 'custom']);

/**
 * Agent status values
 */
export const AgentStatusSchema = z.enum([
  'pending',
  'starting',
  'authenticating',
  'ready',
  'busy',
  'stopping',
  'stopped',
  'error',
]);

/**
 * Schema shape for spawning a new agent
 */
export const SpawnInputShape = {
  name: z.string().describe('Human-readable name for the agent'),
  type: AgentTypeSchema.describe('CLI agent type'),
  capabilities: z.array(z.string()).describe('List of capabilities this agent has'),
  role: z.string().optional().describe('Org role: architect, engineer, qa, etc.'),
  workdir: z.string().optional().describe('Working directory for the agent'),
  waitForReady: z.boolean().optional().default(true).describe('Wait for agent to be ready before returning'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  reportsTo: z.string().optional().describe('Agent ID this one reports to'),
  autoRestart: z.boolean().optional().describe('Restart on crash'),
  idleTimeout: z.number().optional().describe('Stop after N seconds idle'),
};

export const SpawnInputSchema = z.object(SpawnInputShape);
export type SpawnInput = z.infer<typeof SpawnInputSchema>;

/**
 * Schema shape for stopping an agent
 */
export const StopInputShape = {
  agentId: z.string().describe('ID of the agent to stop'),
  force: z.boolean().optional().default(false).describe('Force kill instead of graceful shutdown'),
  timeout: z.number().optional().describe('Graceful shutdown timeout in milliseconds'),
};

export const StopInputSchema = z.object(StopInputShape);
export type StopInput = z.infer<typeof StopInputSchema>;

/**
 * Schema shape for listing agents
 */
export const ListInputShape = {
  status: z
    .union([AgentStatusSchema, z.array(AgentStatusSchema)])
    .optional()
    .describe('Filter by status'),
  type: z
    .union([AgentTypeSchema, z.array(AgentTypeSchema)])
    .optional()
    .describe('Filter by agent type'),
  role: z.string().optional().describe('Filter by org role'),
  capabilities: z.array(z.string()).optional().describe('Filter by required capabilities'),
};

export const ListInputSchema = z.object(ListInputShape);
export type ListInput = z.infer<typeof ListInputSchema>;

/**
 * Schema shape for getting agent details
 */
export const GetInputShape = {
  agentId: z.string().describe('ID of the agent to retrieve'),
};

export const GetInputSchema = z.object(GetInputShape);
export type GetInput = z.infer<typeof GetInputSchema>;

/**
 * Schema shape for sending a message to an agent
 */
export const SendInputShape = {
  agentId: z.string().describe('ID of the agent to send to'),
  message: z.string().describe('Message content to send'),
  expectResponse: z.boolean().optional().default(false).describe('Wait for a response'),
  timeout: z.number().optional().describe('Response timeout in milliseconds'),
};

export const SendInputSchema = z.object(SendInputShape);
export type SendInput = z.infer<typeof SendInputSchema>;

/**
 * Schema shape for getting agent logs
 */
export const LogsInputShape = {
  agentId: z.string().describe('ID of the agent'),
  tail: z.number().optional().describe('Number of lines from the end'),
};

export const LogsInputSchema = z.object(LogsInputShape);
export type LogsInput = z.infer<typeof LogsInputSchema>;

/**
 * Schema shape for getting agent metrics
 */
export const MetricsInputShape = {
  agentId: z.string().describe('ID of the agent'),
};

export const MetricsInputSchema = z.object(MetricsInputShape);
export type MetricsInput = z.infer<typeof MetricsInputSchema>;

/**
 * Schema shape for health check (no inputs)
 */
export const HealthInputShape = {};

export const HealthInputSchema = z.object(HealthInputShape);
export type HealthInput = z.infer<typeof HealthInputSchema>;
