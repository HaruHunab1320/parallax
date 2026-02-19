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
  ruleOverrides: z.record(z.union([z.record(z.unknown()), z.null()])).optional()
    .describe('Override or disable adapter auto-response rules. Keys are regex source strings; null disables the rule, objects merge into it.'),
  stallTimeoutMs: z.number().optional()
    .describe('Per-agent stall timeout in ms. Overrides manager default.'),
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

export const ProvisionWorkspaceInputSchema = z.object({
  repo: z.string().describe('Repository URL to clone (e.g. https://github.com/owner/repo)'),
  baseBranch: z.string().default('main').describe('Base branch to create from'),
  provider: z.string().default('github').describe('Git provider'),
  strategy: z.enum(['clone', 'worktree']).default('clone').describe('Workspace strategy'),
  executionId: z.string().describe('Execution/session ID for branch naming'),
  role: z.string().default('engineer').describe('Role/task identifier for branch naming'),
  slug: z.string().optional().describe('Human-readable slug for branch name'),
  branchStrategy: z.enum(['feature_branch', 'fork', 'direct']).default('feature_branch')
    .describe('Branch creation strategy'),
  credentials: z.object({
    type: z.enum(['pat', 'oauth']),
    token: z.string(),
  }).optional().describe('Git credentials (PAT or OAuth token)'),
});

export const FinalizeWorkspaceInputSchema = z.object({
  workspaceId: z.string().describe('ID of the workspace to finalize'),
  push: z.boolean().default(true).describe('Push the branch'),
  createPr: z.boolean().default(false).describe('Create a pull request'),
  pr: z.object({
    title: z.string(),
    body: z.string(),
    targetBranch: z.string(),
    draft: z.boolean().optional(),
    labels: z.array(z.string()).optional(),
    reviewers: z.array(z.string()).optional(),
  }).optional().describe('PR configuration (required if createPr is true)'),
  cleanup: z.boolean().default(false).describe('Clean up workspace after finalization'),
});

export const CleanupWorkspaceInputSchema = z.object({
  workspaceId: z.string().describe('ID of the workspace to clean up'),
});

export const GetWorkspaceFilesInputSchema = z.object({
  agentType: z.enum(['claude', 'codex', 'gemini', 'aider']).describe('Agent type to get workspace files for'),
});

export const WriteWorkspaceFileInputSchema = z.object({
  agentType: z.enum(['claude', 'codex', 'gemini', 'aider']).describe('Agent type to write workspace file for'),
  workspacePath: z.string().describe('Absolute path to the workspace directory'),
  content: z.string().describe('Content to write to the file'),
  fileName: z.string().optional().describe('Custom file name override (default: agent primary memory file)'),
  append: z.boolean().optional().describe('Append to existing file instead of overwriting'),
});

// Types
export type SpawnInput = z.infer<typeof SpawnInputSchema>;
export type StopInput = z.infer<typeof StopInputSchema>;
export type ListInput = z.infer<typeof ListInputSchema>;
export type GetInput = z.infer<typeof GetInputSchema>;
export type SendInput = z.infer<typeof SendInputSchema>;
export type LogsInput = z.infer<typeof LogsInputSchema>;
export type MetricsInput = z.infer<typeof MetricsInputSchema>;
export type HealthInput = z.infer<typeof HealthInputSchema>;
export type ProvisionWorkspaceInput = z.infer<typeof ProvisionWorkspaceInputSchema>;
export type FinalizeWorkspaceInput = z.infer<typeof FinalizeWorkspaceInputSchema>;
export type CleanupWorkspaceInput = z.infer<typeof CleanupWorkspaceInputSchema>;
export type GetWorkspaceFilesInput = z.infer<typeof GetWorkspaceFilesInputSchema>;
export type WriteWorkspaceFileInput = z.infer<typeof WriteWorkspaceFileInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions (JSON Schema format for MCP)
// ─────────────────────────────────────────────────────────────────────────────

export const TOOLS = [
  {
    name: 'spawn',
    description: 'Create and start a new AI agent. Supports rule overrides to customize adapter behavior and per-agent stall timeouts.',
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
        ruleOverrides: {
          type: 'object',
          additionalProperties: { oneOf: [{ type: 'object' }, { type: 'null' }] },
          description: 'Override or disable adapter auto-response rules. Keys are regex source strings (e.g. "update available.*\\\\[y\\\\/n\\\\]"); null disables the rule, objects merge fields into it.',
        },
        stallTimeoutMs: { type: 'number', description: 'Per-agent stall timeout in ms. Overrides manager default.' },
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
    description: 'Check the health status of the runtime, including adapter installation status',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'provision_workspace',
    description: 'Provision a git workspace by cloning a repository and creating a feature branch. Returns the workspace path for use as an agent workdir.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Repository URL (e.g. https://github.com/owner/repo)' },
        baseBranch: { type: 'string', description: 'Base branch to create from', default: 'main' },
        provider: { type: 'string', description: 'Git provider', default: 'github' },
        strategy: { type: 'string', enum: ['clone', 'worktree'], description: 'Workspace strategy', default: 'clone' },
        executionId: { type: 'string', description: 'Execution/session ID for branch naming' },
        role: { type: 'string', description: 'Role/task identifier for branch naming', default: 'engineer' },
        slug: { type: 'string', description: 'Human-readable slug for branch name' },
        branchStrategy: { type: 'string', enum: ['feature_branch', 'fork', 'direct'], description: 'Branch strategy', default: 'feature_branch' },
        credentials: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['pat', 'oauth'] },
            token: { type: 'string' },
          },
          required: ['type', 'token'],
          description: 'Git credentials',
        },
      },
      required: ['repo', 'executionId'],
    },
  },
  {
    name: 'finalize_workspace',
    description: 'Finalize a workspace by pushing changes, optionally creating a pull request, and cleaning up.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        push: { type: 'boolean', description: 'Push the branch', default: true },
        createPr: { type: 'boolean', description: 'Create a pull request', default: false },
        pr: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
            targetBranch: { type: 'string' },
            draft: { type: 'boolean' },
            labels: { type: 'array', items: { type: 'string' } },
            reviewers: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'body', 'targetBranch'],
          description: 'PR configuration',
        },
        cleanup: { type: 'boolean', description: 'Clean up workspace after', default: false },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'cleanup_workspace',
    description: 'Clean up a provisioned workspace (remove local files)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace to clean up' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_workspace_files',
    description: 'Get workspace file descriptors for an agent type. Returns the files the agent CLI reads automatically (e.g. CLAUDE.md, GEMINI.md, .aider.conventions.md).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentType: { type: 'string', enum: ['claude', 'codex', 'gemini', 'aider'], description: 'Agent type' },
      },
      required: ['agentType'],
    },
  },
  {
    name: 'write_workspace_file',
    description: 'Write a workspace/memory file for an agent type. Creates the agent-specific instruction file (e.g. CLAUDE.md) in the given workspace directory.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentType: { type: 'string', enum: ['claude', 'codex', 'gemini', 'aider'], description: 'Agent type' },
        workspacePath: { type: 'string', description: 'Absolute path to the workspace directory' },
        content: { type: 'string', description: 'Content to write to the file' },
        fileName: { type: 'string', description: 'Custom file name override' },
        append: { type: 'boolean', description: 'Append to existing file instead of overwriting' },
      },
      required: ['agentType', 'workspacePath', 'content'],
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
    ruleOverrides: validated.ruleOverrides as Record<string, Record<string, unknown> | null> | undefined,
    stallTimeoutMs: validated.stallTimeoutMs,
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

export async function executeProvisionWorkspace(manager: AgentManager, input: ProvisionWorkspaceInput) {
  const validated = ProvisionWorkspaceInputSchema.parse(input);

  const workspace = await manager.provisionWorkspace({
    repo: validated.repo,
    provider: validated.provider as 'github',
    strategy: validated.strategy,
    branchStrategy: validated.branchStrategy,
    baseBranch: validated.baseBranch,
    execution: {
      id: validated.executionId,
      patternName: 'mcp-provision',
    },
    task: {
      id: validated.executionId,
      role: validated.role,
      slug: validated.slug,
    },
    userCredentials: validated.credentials,
  });

  return {
    success: true,
    workspace: {
      id: workspace.id,
      path: workspace.path,
      repo: workspace.repo,
      branch: workspace.branch.name,
      status: workspace.status,
      strategy: workspace.strategy,
    },
  };
}

export async function executeFinalizeWorkspace(manager: AgentManager, input: FinalizeWorkspaceInput) {
  const validated = FinalizeWorkspaceInputSchema.parse(input);

  const result = await manager.finalizeWorkspace(validated.workspaceId, {
    push: validated.push,
    createPr: validated.createPr,
    pr: validated.pr,
    cleanup: validated.cleanup,
  });

  return {
    success: true,
    workspaceId: validated.workspaceId,
    pullRequest: result
      ? { number: result.number, url: result.url }
      : undefined,
  };
}

export async function executeCleanupWorkspace(manager: AgentManager, input: CleanupWorkspaceInput) {
  const validated = CleanupWorkspaceInputSchema.parse(input);
  await manager.cleanupWorkspace(validated.workspaceId);
  return { success: true, workspaceId: validated.workspaceId };
}

export function executeGetWorkspaceFiles(manager: AgentManager, input: GetWorkspaceFilesInput) {
  const validated = GetWorkspaceFilesInputSchema.parse(input);
  const files = manager.getWorkspaceFiles(validated.agentType);
  const memoryFile = files.find(f => f.type === 'memory');

  return {
    success: true,
    agentType: validated.agentType,
    files,
    memoryFilePath: memoryFile?.relativePath ?? null,
  };
}

export async function executeWriteWorkspaceFile(manager: AgentManager, input: WriteWorkspaceFileInput) {
  const validated = WriteWorkspaceFileInputSchema.parse(input);
  const path = await manager.writeWorkspaceFile(
    validated.agentType,
    validated.workspacePath,
    validated.content,
    {
      fileName: validated.fileName,
      append: validated.append,
    },
  );

  return {
    success: true,
    path,
  };
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
  provision_workspace: 'workspace:provision',
  finalize_workspace: 'workspace:finalize',
  cleanup_workspace: 'workspace:cleanup',
  get_workspace_files: 'workspace:read',
  write_workspace_file: 'workspace:write',
};
