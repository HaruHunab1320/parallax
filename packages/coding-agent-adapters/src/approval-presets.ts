/**
 * Approval Presets
 *
 * Unified preset system for controlling tool permissions across all supported
 * coding agent CLIs. Each preset translates to the correct per-CLI config
 * format (JSON settings files, CLI flags, env vars).
 */

import type { AdapterType } from './base-coding-adapter';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ToolCategory =
  | 'file_read'
  | 'file_write'
  | 'shell'
  | 'web'
  | 'agent'
  | 'planning'
  | 'user_interaction';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ApprovalPreset = 'readonly' | 'standard' | 'permissive' | 'autonomous';

export interface ToolCategoryInfo {
  category: ToolCategory;
  risk: RiskLevel;
  description: string;
}

export interface PresetDefinition {
  preset: ApprovalPreset;
  description: string;
  autoApprove: ToolCategory[];
  requireApproval: ToolCategory[];
  blocked: ToolCategory[];
}

export interface ApprovalConfig {
  preset: ApprovalPreset;
  cliFlags: string[];
  workspaceFiles: Array<{
    relativePath: string;
    content: string;
    format: 'json' | 'yaml' | 'toml';
  }>;
  envVars: Record<string, string>;
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_CATEGORIES: ToolCategoryInfo[] = [
  { category: 'file_read', risk: 'low', description: 'Read files, search, list directories' },
  { category: 'file_write', risk: 'medium', description: 'Write, edit, and create files' },
  { category: 'shell', risk: 'high', description: 'Execute shell commands' },
  { category: 'web', risk: 'medium', description: 'Web search and fetch' },
  { category: 'agent', risk: 'medium', description: 'Spawn sub-agents, skills, MCP tools' },
  { category: 'planning', risk: 'low', description: 'Task planning and todo management' },
  { category: 'user_interaction', risk: 'low', description: 'Ask user questions' },
];

export const PRESET_DEFINITIONS: PresetDefinition[] = [
  {
    preset: 'readonly',
    description: 'Read-only. Safe for auditing.',
    autoApprove: ['file_read', 'planning', 'user_interaction'],
    requireApproval: [],
    blocked: ['file_write', 'shell', 'web', 'agent'],
  },
  {
    preset: 'standard',
    description: 'Standard dev. Reads + web auto, writes/shell prompt.',
    autoApprove: ['file_read', 'planning', 'user_interaction', 'web'],
    requireApproval: ['file_write', 'shell', 'agent'],
    blocked: [],
  },
  {
    preset: 'permissive',
    description: 'File ops auto-approved, shell still prompts.',
    autoApprove: ['file_read', 'file_write', 'planning', 'user_interaction', 'web', 'agent'],
    requireApproval: ['shell'],
    blocked: [],
  },
  {
    preset: 'autonomous',
    description: 'Everything auto-approved. Use with sandbox.',
    autoApprove: ['file_read', 'file_write', 'shell', 'web', 'agent', 'planning', 'user_interaction'],
    requireApproval: [],
    blocked: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Per-CLI Tool Category Mappings
// ─────────────────────────────────────────────────────────────────────────────

export const CLAUDE_TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // file_read
  Read: 'file_read',
  Grep: 'file_read',
  Glob: 'file_read',
  LS: 'file_read',
  NotebookRead: 'file_read',
  // file_write
  Write: 'file_write',
  Edit: 'file_write',
  MultiEdit: 'file_write',
  NotebookEdit: 'file_write',
  // shell
  Bash: 'shell',
  BashOutput: 'shell',
  KillShell: 'shell',
  // web
  WebSearch: 'web',
  WebFetch: 'web',
  // agent
  Task: 'agent',
  Skill: 'agent',
  // planning
  TodoWrite: 'planning',
  // user_interaction
  AskUserQuestion: 'user_interaction',
};

export const GEMINI_TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // file_read
  read_file: 'file_read',
  read_many_files: 'file_read',
  list_directory: 'file_read',
  glob: 'file_read',
  search_file_content: 'file_read',
  // file_write
  write_file: 'file_write',
  replace: 'file_write',
  // shell
  run_shell_command: 'shell',
  // web
  web_fetch: 'web',
  google_web_search: 'web',
  // agent
  activate_skill: 'agent',
  get_internal_docs: 'agent',
  // planning
  save_memory: 'planning',
  write_todos: 'planning',
  // user_interaction
  ask_user: 'user_interaction',
};

export const CODEX_TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // shell (codex uses shell for most operations)
  exec_command: 'shell',
  write_stdin: 'shell',
  shell_command: 'shell',
  // file_write
  apply_patch: 'file_write',
  // file_read
  grep_files: 'file_read',
  read_file: 'file_read',
  list_dir: 'file_read',
  // web
  web_search: 'web',
  view_image: 'web',
  // agent
  spawn_agent: 'agent',
  send_input: 'agent',
  resume_agent: 'agent',
  wait: 'agent',
  close_agent: 'agent',
  // planning
  update_plan: 'planning',
  // user_interaction
  request_user_input: 'user_interaction',
};

export const AIDER_COMMAND_CATEGORIES: Record<string, ToolCategory> = {
  // file_read
  '/read-only': 'file_read',
  '/ls': 'file_read',
  '/map': 'file_read',
  '/map-refresh': 'file_read',
  '/tokens': 'file_read',
  '/diff': 'file_read',
  '/context': 'file_read',
  // file_write
  '/add': 'file_write',
  '/drop': 'file_write',
  '/edit': 'file_write',
  '/code': 'file_write',
  '/architect': 'file_write',
  '/undo': 'file_write',
  // shell
  '/run': 'shell',
  '/test': 'shell',
  '/lint': 'shell',
  '/git': 'shell',
  // web
  '/web': 'web',
  // planning
  '/ask': 'planning',
  // user_interaction
  '/voice': 'user_interaction',
  '/help': 'user_interaction',
  // config/other
  '/model': 'planning',
  '/settings': 'planning',
  '/commit': 'file_write',
  '/clear': 'planning',
  '/reset': 'planning',
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-CLI Config Generators
// ─────────────────────────────────────────────────────────────────────────────

function getToolsForCategories(
  mapping: Record<string, ToolCategory>,
  categories: ToolCategory[],
): string[] {
  return Object.entries(mapping)
    .filter(([, cat]) => categories.includes(cat))
    .map(([tool]) => tool);
}

export function generateClaudeApprovalConfig(preset: ApprovalPreset): ApprovalConfig {
  const def = getPresetDefinition(preset);

  const allowTools = getToolsForCategories(CLAUDE_TOOL_CATEGORIES, def.autoApprove);
  const denyTools = getToolsForCategories(CLAUDE_TOOL_CATEGORIES, def.blocked);

  const settings: Record<string, unknown> = {
    permissions: {} as Record<string, unknown>,
  };

  const permissions = settings.permissions as Record<string, unknown>;
  if (allowTools.length > 0) {
    permissions.allow = allowTools;
  }
  if (denyTools.length > 0) {
    permissions.deny = denyTools;
  }

  // Autonomous mode: enable sandbox and auto-allow bash
  if (preset === 'autonomous') {
    settings.sandbox = {
      enabled: true,
      autoAllowBashIfSandboxed: true,
    };
  }

  const cliFlags: string[] = [];

  // Autonomous: pass all tools via --tools flag
  if (preset === 'autonomous') {
    const allTools = Object.keys(CLAUDE_TOOL_CATEGORIES);
    cliFlags.push('--tools', allTools.join(','));
  }

  return {
    preset,
    cliFlags,
    workspaceFiles: [
      {
        relativePath: '.claude/settings.json',
        content: JSON.stringify(settings, null, 2),
        format: 'json',
      },
    ],
    envVars: {},
    summary: `Claude Code: ${def.description}`,
  };
}

export function generateGeminiApprovalConfig(preset: ApprovalPreset): ApprovalConfig {
  const def = getPresetDefinition(preset);
  const cliFlags: string[] = [];

  const allowedTools = getToolsForCategories(GEMINI_TOOL_CATEGORIES, def.autoApprove);
  const excludeTools = getToolsForCategories(GEMINI_TOOL_CATEGORIES, def.blocked);

  let approvalMode: string;

  switch (preset) {
    case 'readonly':
      approvalMode = 'plan';
      cliFlags.push('--approval-mode', 'plan');
      break;
    case 'standard':
      approvalMode = 'default';
      break;
    case 'permissive':
      approvalMode = 'auto_edit';
      cliFlags.push('--approval-mode', 'auto_edit');
      break;
    case 'autonomous':
      approvalMode = 'auto_edit';
      cliFlags.push('-y');
      break;
  }

  const settings: Record<string, unknown> = {
    general: {
      defaultApprovalMode: approvalMode,
    },
    tools: {} as Record<string, unknown>,
  };

  const tools = settings.tools as Record<string, unknown>;
  if (allowedTools.length > 0) {
    tools.allowed = allowedTools;
  }
  if (excludeTools.length > 0) {
    tools.exclude = excludeTools;
  }

  return {
    preset,
    cliFlags,
    workspaceFiles: [
      {
        relativePath: '.gemini/settings.json',
        content: JSON.stringify(settings, null, 2),
        format: 'json',
      },
    ],
    envVars: {},
    summary: `Gemini CLI: ${def.description}`,
  };
}

export function generateCodexApprovalConfig(preset: ApprovalPreset): ApprovalConfig {
  const cliFlags: string[] = [];

  let approvalPolicy: string;
  let sandboxMode: string;
  let webSearch: boolean;

  switch (preset) {
    case 'readonly':
      approvalPolicy = 'untrusted';
      sandboxMode = 'workspace-read';
      webSearch = false;
      cliFlags.push('--sandbox', 'workspace-read', '-a', 'untrusted');
      break;
    case 'standard':
      approvalPolicy = 'on-failure';
      sandboxMode = 'workspace-write';
      webSearch = true;
      cliFlags.push('--sandbox', 'workspace-write');
      break;
    case 'permissive':
      approvalPolicy = 'on-request';
      sandboxMode = 'workspace-write';
      webSearch = true;
      cliFlags.push('-a', 'on-request');
      break;
    case 'autonomous':
      approvalPolicy = 'never';
      sandboxMode = 'workspace-write';
      webSearch = true;
      cliFlags.push('--full-auto');
      break;
  }

  const config = {
    approval_policy: approvalPolicy,
    sandbox_mode: sandboxMode,
    tools: {
      web_search: webSearch,
    },
  };

  return {
    preset,
    cliFlags,
    workspaceFiles: [
      {
        relativePath: '.codex/config.json',
        content: JSON.stringify(config, null, 2),
        format: 'json',
      },
    ],
    envVars: {},
    summary: `Codex: ${getPresetDefinition(preset).description}`,
  };
}

export function generateAiderApprovalConfig(preset: ApprovalPreset): ApprovalConfig {
  const def = getPresetDefinition(preset);
  const cliFlags: string[] = [];
  const lines: string[] = [];

  switch (preset) {
    case 'readonly':
      lines.push('yes-always: false');
      lines.push('no-auto-commits: true');
      cliFlags.push('--no-auto-commits');
      break;
    case 'standard':
      lines.push('yes-always: false');
      break;
    case 'permissive':
      lines.push('yes-always: true');
      cliFlags.push('--yes-always');
      break;
    case 'autonomous':
      lines.push('yes-always: true');
      cliFlags.push('--yes-always');
      break;
  }

  return {
    preset,
    cliFlags,
    workspaceFiles: [
      {
        relativePath: '.aider.conf.yml',
        content: lines.join('\n') + '\n',
        format: 'yaml',
      },
    ],
    envVars: {},
    summary: `Aider: ${def.description}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function generateApprovalConfig(
  adapterType: AdapterType,
  preset: ApprovalPreset,
): ApprovalConfig {
  switch (adapterType) {
    case 'claude':
      return generateClaudeApprovalConfig(preset);
    case 'gemini':
      return generateGeminiApprovalConfig(preset);
    case 'codex':
      return generateCodexApprovalConfig(preset);
    case 'aider':
      return generateAiderApprovalConfig(preset);
    default:
      throw new Error(`Unknown adapter type: ${adapterType}`);
  }
}

export function listPresets(): PresetDefinition[] {
  return [...PRESET_DEFINITIONS];
}

export function getPresetDefinition(preset: ApprovalPreset): PresetDefinition {
  const def = PRESET_DEFINITIONS.find(d => d.preset === preset);
  if (!def) {
    throw new Error(`Unknown preset: ${preset}`);
  }
  return def;
}
