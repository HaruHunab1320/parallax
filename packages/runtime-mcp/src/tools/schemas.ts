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
export const AgentTypeSchema = z.enum([
  'claude',
  'codex',
  'gemini',
  'aider',
  'custom',
]);

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

export const ThreadStatusSchema = z.enum([
  'pending',
  'preparing',
  'starting',
  'ready',
  'running',
  'blocked',
  'idle',
  'waiting',
  'completed',
  'failed',
  'stopped',
]);

/**
 * Schema shape for spawning a new agent
 */
export const SpawnInputShape = {
  name: z.string().describe('Human-readable name for the agent'),
  type: AgentTypeSchema.describe('CLI agent type'),
  capabilities: z
    .array(z.string())
    .describe('List of capabilities this agent has'),
  role: z
    .string()
    .optional()
    .describe('Org role: architect, engineer, qa, etc.'),
  workdir: z.string().optional().describe('Working directory for the agent'),
  waitForReady: z
    .boolean()
    .optional()
    .default(true)
    .describe('Wait for agent to be ready before returning'),
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
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe('Force kill instead of graceful shutdown'),
  timeout: z
    .number()
    .optional()
    .describe('Graceful shutdown timeout in milliseconds'),
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
  capabilities: z
    .array(z.string())
    .optional()
    .describe('Filter by required capabilities'),
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
  expectResponse: z
    .boolean()
    .optional()
    .default(false)
    .describe('Wait for a response'),
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

export const SpawnThreadInputShape = {
  executionId: z.string().describe('Execution ID that owns the thread'),
  name: z.string().describe('Human-readable thread name'),
  agentType: AgentTypeSchema.describe('CLI agent type backing the thread'),
  objective: z.string().describe('Objective for the thread to pursue'),
  role: z
    .string()
    .optional()
    .describe('Optional orchestration role for the thread'),
  workspacePath: z
    .string()
    .optional()
    .describe('Workspace path for the thread'),
  workspaceRepo: z
    .string()
    .optional()
    .describe('Repository URL or slug for prepared workspace resolution'),
  workspaceBranch: z
    .string()
    .optional()
    .describe('Branch name for the prepared workspace'),
  approvalPreset: z
    .enum(['readonly', 'standard', 'permissive', 'autonomous'])
    .optional()
    .describe('Approval preset controlling tool permissions'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Additional thread metadata'),
};

export const SpawnThreadInputSchema = z.object(SpawnThreadInputShape);
export type SpawnThreadInput = z.infer<typeof SpawnThreadInputSchema>;

export const StopThreadInputShape = {
  threadId: z.string().describe('ID of the thread to stop'),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe('Force kill instead of graceful shutdown'),
  timeout: z
    .number()
    .optional()
    .describe('Graceful shutdown timeout in milliseconds'),
};

export const StopThreadInputSchema = z.object(StopThreadInputShape);
export type StopThreadInput = z.infer<typeof StopThreadInputSchema>;

export const ListThreadsInputShape = {
  executionId: z.string().optional().describe('Filter by execution ID'),
  role: z.string().optional().describe('Filter by thread role'),
  status: z
    .union([ThreadStatusSchema, z.array(ThreadStatusSchema)])
    .optional()
    .describe('Filter by thread status'),
};

export const ListThreadsInputSchema = z.object(ListThreadsInputShape);
export type ListThreadsInput = z.infer<typeof ListThreadsInputSchema>;

export const GetThreadInputShape = {
  threadId: z.string().describe('ID of the thread to retrieve'),
};

export const GetThreadInputSchema = z.object(GetThreadInputShape);
export type GetThreadInput = z.infer<typeof GetThreadInputSchema>;

export const SendThreadInputShape = {
  threadId: z.string().describe('ID of the thread to send input to'),
  message: z.string().optional().describe('Message content to send'),
  raw: z.string().optional().describe('Raw bytes or terminal input to send'),
  keys: z
    .array(z.string())
    .optional()
    .describe('Key presses to send to the thread terminal'),
};

export const SendThreadInputSchema = z.object(SendThreadInputShape);
export type SendThreadInput = z.infer<typeof SendThreadInputSchema>;
