/**
 * Write MCP Config
 *
 * Generates the MCP configuration file for a thread's workspace so that
 * Claude Code (and other MCP-aware CLI agents) can connect to the swarm
 * coordination server.
 */

import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export interface McpConfigOptions {
  workspaceDir: string;
  threadId: string;
  executionId: string;
  role: string;
  controlPlaneUrl: string;
  apiKey?: string;
}

/**
 * Write .claude/settings.local.json with MCP server config for the swarm
 * coordination tools (ask_architect, share_decision, etc.)
 */
export function writeMcpConfig(options: McpConfigOptions): void {
  const {
    workspaceDir,
    threadId,
    executionId,
    role,
    controlPlaneUrl,
  } = options;

  // Claude Code reads MCP config from .claude/settings.local.json
  const claudeDir = path.join(workspaceDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const settings = {
    mcpServers: {
      'parallax-swarm': {
        command: 'npx',
        args: [
          'tsx',
          path.join(__dirname, 'swarm-mcp-entrypoint.ts'),
        ],
        env: {
          PARALLAX_THREAD_ID: threadId,
          PARALLAX_EXECUTION_ID: executionId,
          PARALLAX_ROLE: role,
          PARALLAX_CONTROL_PLANE_URL: controlPlaneUrl,
        },
      },
    },
  };

  writeFileSync(
    path.join(claudeDir, 'settings.local.json'),
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}
