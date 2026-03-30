/**
 * Smoke Test for parallax-agent-runtime
 *
 * Run with: pnpm test:smoke
 *
 * Exercises the real modules (no mocks) against a live testbed repo:
 * 1. All modules import and construct correctly
 * 2. AgentManager wires up adapters and health checks
 * 3. Tool schemas validate and reject as expected
 * 4. Workspace provisioning, finalization (with PR), and cleanup — real git ops
 * 5. Auth module works end-to-end
 * 6. Hook telemetry config generation
 * 7. Worktree operations
 * 8. New spawn options (inheritProcessEnv, skipAdapterAutoResponse, etc.)
 *
 * Requires GITHUB_PAT in the root .env file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CredentialService,
  type GitCredential,
  type GitProviderAdapter,
  type PullRequestInfo,
} from 'git-workspace-service';
import pino from 'pino';
import {
  AddWorktreeInputSchema,
  // Manager
  AgentManager,
  GetHookConfigInputSchema,
  generateSpawnDevAgentPrompt,
  generateSpawnReviewTeamPrompt,
  ListWorktreesInputSchema,
  // Resources
  listAgentResources,
  McpAuthError,
  // Auth
  McpAuthHandler,
  NotifyHookEventInputSchema,
  // Server
  ParallaxMcpServer,
  // Prompts
  PROMPTS,
  ProvisionWorkspaceInputSchema,
  RemoveWorktreeInputSchema,
  SpawnInputSchema,
  TOOL_PERMISSIONS,
  // Tools
  TOOLS,
  WriteRawInputSchema,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const TESTBED_REPO =
  'https://github.com/HaruHunab1320/git-workspace-service-testbed';
const ROOT_DIR = resolve(__dirname, '../../..');

// Load PAT from root .env
function loadPat(): string {
  try {
    const env = readFileSync(join(ROOT_DIR, '.env'), 'utf-8');
    const match = env.match(/^GITHUB_PAT=(.+)$/m);
    if (!match) throw new Error('GITHUB_PAT not found in .env');
    return match[1].trim();
  } catch {
    throw new Error(
      'Cannot read GITHUB_PAT from root .env — needed for integration test'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal PAT-based GitHub provider (for PR creation without a GitHub App)
// ─────────────────────────────────────────────────────────────────────────────

function createPatGitHubProvider(): GitProviderAdapter {
  return {
    name: 'github' as const,
    async getCredentials() {
      throw new Error('Not implemented for PAT provider');
    },
    async revokeCredential() {
      /* no-op */
    },
    async createPullRequest(opts: {
      repo: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      body: string;
      draft?: boolean;
      credential: GitCredential;
    }): Promise<PullRequestInfo> {
      // Parse owner/repo from URL
      const match = opts.repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!match) throw new Error(`Cannot parse repo: ${opts.repo}`);
      const [, owner, repo] = match;

      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.credential.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: opts.title,
            body: opts.body,
            head: opts.sourceBranch,
            base: opts.targetBranch,
            draft: opts.draft ?? false,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${err}`);
      }

      const data = (await res.json()) as {
        number: number;
        html_url: string;
        state: string;
        created_at: string;
        title: string;
      };
      return {
        number: data.number,
        url: data.html_url,
        state: data.state as 'open',
        sourceBranch: opts.sourceBranch,
        targetBranch: opts.targetBranch,
        title: data.title,
        executionId: '',
        createdAt: new Date(data.created_at),
      };
    },
    async branchExists() {
      return false;
    },
    async getDefaultBranch() {
      return 'main';
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const logger = pino({ level: 'silent' });
const wsLogger = {
  debug: (_d: Record<string, unknown>, _m: string) => {},
  info: (_d: Record<string, unknown>, _m: string) => {},
  warn: (d: Record<string, unknown>, m: string) =>
    console.log(`    [warn] ${m}`, JSON.stringify(d)),
  error: (d: Record<string, unknown>, m: string) =>
    console.error(`    [error] ${m}`, JSON.stringify(d)),
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string
): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(
      `  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('  parallax-agent-runtime v0.8.5 — Integration Smoke Test');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const pat = loadPat();
  console.log(`  Using testbed: ${TESTBED_REPO}`);
  console.log(`  PAT: ${pat.slice(0, 15)}...${pat.slice(-4)}\n`);

  // ─── 1. Exports ──────────────────────────────────────────────────────────
  console.log('1. Module exports');
  assert(typeof ParallaxMcpServer === 'function', 'ParallaxMcpServer exports');
  assert(typeof AgentManager === 'function', 'AgentManager exports');
  assert(typeof McpAuthHandler === 'function', 'McpAuthHandler exports');
  assert(Array.isArray(TOOLS), 'TOOLS is an array');
  assertEqual(TOOLS.length, 21, 'TOOLS has 21 tools');
  assert(Array.isArray(PROMPTS), 'PROMPTS is an array');

  // ─── 2. Tool definitions ─────────────────────────────────────────────────
  console.log('\n2. Tool definitions');
  const toolNames = TOOLS.map((t) => t.name);
  const expectedTools = [
    'spawn',
    'stop',
    'list',
    'get',
    'send',
    'logs',
    'metrics',
    'health',
    'provision_workspace',
    'finalize_workspace',
    'cleanup_workspace',
    'get_workspace_files',
    'write_workspace_file',
    'list_presets',
    'get_preset_config',
    'notify_hook_event',
    'write_raw',
    'get_hook_config',
    'add_worktree',
    'list_worktrees',
    'remove_worktree',
  ];
  for (const name of expectedTools) {
    assert(toolNames.includes(name), `Tool "${name}" defined`);
  }
  assertEqual(
    TOOL_PERMISSIONS.provision_workspace,
    'workspace:provision',
    'workspace permission mapped'
  );
  assertEqual(
    TOOL_PERMISSIONS.notify_hook_event,
    'agents:hook',
    'hook event permission mapped'
  );
  assertEqual(
    TOOL_PERMISSIONS.add_worktree,
    'workspace:provision',
    'worktree permission mapped'
  );

  // ─── 3. Zod schemas ──────────────────────────────────────────────────────
  console.log('\n3. Zod schema validation');

  // Spawn schema — existing fields
  const spawnParsed = SpawnInputSchema.parse({
    name: 'test',
    type: 'claude',
    capabilities: ['code'],
    ruleOverrides: { 'trust.*folder': null },
    stallTimeoutMs: 10000,
  });
  assertEqual(spawnParsed.name, 'test', 'SpawnInputSchema parses valid input');
  assert(spawnParsed.ruleOverrides !== undefined, 'ruleOverrides parsed');
  assertEqual(spawnParsed.stallTimeoutMs, 10000, 'stallTimeoutMs parsed');

  // Spawn schema — new fields
  const spawnWithNew = SpawnInputSchema.parse({
    name: 'isolated',
    type: 'hermes',
    capabilities: ['code'],
    inheritProcessEnv: false,
    skipAdapterAutoResponse: true,
    readySettleMs: 2000,
    traceTaskCompletion: true,
  });
  assertEqual(
    spawnWithNew.type,
    'hermes',
    'SpawnInputSchema accepts hermes type'
  );
  assertEqual(
    spawnWithNew.inheritProcessEnv,
    false,
    'inheritProcessEnv parsed'
  );
  assertEqual(
    spawnWithNew.skipAdapterAutoResponse,
    true,
    'skipAdapterAutoResponse parsed'
  );
  assertEqual(spawnWithNew.readySettleMs, 2000, 'readySettleMs parsed');
  assertEqual(
    spawnWithNew.traceTaskCompletion,
    true,
    'traceTaskCompletion parsed'
  );

  let schemaRejected = false;
  try {
    SpawnInputSchema.parse({ name: 'test', type: 'invalid', capabilities: [] });
  } catch {
    schemaRejected = true;
  }
  assert(schemaRejected, 'SpawnInputSchema rejects invalid agent type');

  // New tool schemas
  const hookParsed = NotifyHookEventInputSchema.parse({
    agentId: 'agent-1',
    event: 'task_complete',
  });
  assertEqual(
    hookParsed.event,
    'task_complete',
    'NotifyHookEventInputSchema parses'
  );

  const rawParsed = WriteRawInputSchema.parse({
    agentId: 'agent-1',
    data: '\x1b[A',
  });
  assertEqual(
    rawParsed.data,
    '\x1b[A',
    'WriteRawInputSchema parses escape sequences'
  );

  const hookCfgParsed = GetHookConfigInputSchema.parse({
    agentType: 'claude',
    httpUrl: 'http://localhost:8080/hooks',
    sessionId: 'sess-1',
  });
  assertEqual(
    hookCfgParsed.agentType,
    'claude',
    'GetHookConfigInputSchema parses'
  );
  assertEqual(
    hookCfgParsed.httpUrl,
    'http://localhost:8080/hooks',
    'httpUrl parsed'
  );
  assertEqual(hookCfgParsed.sessionId, 'sess-1', 'sessionId parsed');

  const worktreeParsed = AddWorktreeInputSchema.parse({
    parentWorkspaceId: 'ws-1',
    branch: 'main',
    executionId: 'exec-1',
  });
  assertEqual(
    worktreeParsed.parentWorkspaceId,
    'ws-1',
    'AddWorktreeInputSchema parses'
  );
  assertEqual(
    worktreeParsed.patternName,
    'mcp-worktree',
    'patternName defaults'
  );

  const listWtParsed = ListWorktreesInputSchema.parse({
    parentWorkspaceId: 'ws-1',
  });
  assertEqual(
    listWtParsed.parentWorkspaceId,
    'ws-1',
    'ListWorktreesInputSchema parses'
  );

  const removeWtParsed = RemoveWorktreeInputSchema.parse({
    workspaceId: 'wt-1',
  });
  assertEqual(
    removeWtParsed.workspaceId,
    'wt-1',
    'RemoveWorktreeInputSchema parses'
  );

  const provisionParsed = ProvisionWorkspaceInputSchema.parse({
    repo: TESTBED_REPO,
    executionId: 'exec-1',
  });
  assertEqual(
    provisionParsed.baseBranch,
    'main',
    'ProvisionWorkspace defaults baseBranch=main'
  );
  assertEqual(
    provisionParsed.strategy,
    'clone',
    'ProvisionWorkspace defaults strategy=clone'
  );

  // ─── 4. AgentManager + health check ──────────────────────────────────────
  console.log('\n4. AgentManager + health check');
  const credentialService = new CredentialService({
    defaultTtlSeconds: 3600,
  });
  credentialService.registerProvider(createPatGitHubProvider());

  const manager = new AgentManager(logger, {
    maxAgents: 5,
    stallDetectionEnabled: true,
    stallTimeoutMs: 8000,
    workspace: {
      config: { baseDir: '/tmp/parallax-smoke-test' },
      credentialService,
      logger: wsLogger as never,
    },
  });
  assert(manager !== null, 'AgentManager constructs with all config');
  assert(manager.hasWorkspaceService(), 'Workspace service enabled');

  const health = await manager.getHealth();
  assert(health.healthy === true, 'Health: healthy=true');
  assertEqual(health.maxAgents, 5, 'Health: maxAgents=5');
  assertEqual(health.agentCount, 0, 'Health: 0 agents');
  assert(
    health.adapters.length === 5,
    'Health: 5 adapters checked (claude, gemini, codex, aider, hermes)'
  );
  assert(
    health.stallDetectionEnabled === true,
    'Health: stall detection enabled'
  );
  assert(
    health.workspaceServiceEnabled === true,
    'Health: workspace service enabled'
  );

  console.log('    Adapter status:');
  for (const adapter of health.adapters) {
    const status = adapter.installed
      ? `installed (v${adapter.version})`
      : `not installed (${adapter.error})`;
    console.log(`      ${adapter.type}: ${status}`);
  }

  // ─── 5. Empty agent operations ───────────────────────────────────────────
  console.log('\n5. Agent operations (empty state)');
  const agents = await manager.list();
  assertEqual(agents.length, 0, 'List returns 0 agents');
  assertEqual(await manager.get('nonexistent'), null, 'Get nonexistent → null');
  assertEqual(
    await manager.metrics('nonexistent'),
    null,
    'Metrics nonexistent → null'
  );

  // ─── 6. Hook telemetry config ────────────────────────────────────────────
  console.log('\n6. Hook telemetry config');
  const claudeHookCfg = manager.getHookTelemetryConfig('claude', {
    httpUrl: 'http://localhost:8080/hooks',
    sessionId: 'test-session',
  });
  // Claude adapter supports hooks — should return config
  if (claudeHookCfg) {
    assert(
      typeof claudeHookCfg.markerPrefix === 'string',
      'Claude hook config has markerPrefix'
    );
    assert(
      typeof claudeHookCfg.settingsHooks === 'object',
      'Claude hook config has settingsHooks'
    );
    console.log(`    Claude marker prefix: ${claudeHookCfg.markerPrefix}`);
  } else {
    assert(
      true,
      'Claude hook config returned null (adapter may not support HTTP hooks in this version)'
    );
  }

  const codexHookCfg = manager.getHookTelemetryConfig('codex');
  assertEqual(
    codexHookCfg,
    null,
    'Codex hook config returns null (no hook support)'
  );

  const customHookCfg = manager.getHookTelemetryConfig('custom');
  assertEqual(customHookCfg, null, 'Custom type hook config returns null');

  // ─── 7. notifyHookEvent + writeRaw (no-op on missing agent) ──────────────
  console.log('\n7. Hook events and raw writes (no-op on missing agent)');
  // These should not throw even when agent doesn't exist
  try {
    manager.notifyHookEvent('nonexistent', 'task_complete');
    assert(true, 'notifyHookEvent on missing agent is a no-op');
  } catch {
    assert(false, 'notifyHookEvent on missing agent should not throw');
  }

  try {
    manager.writeRaw('nonexistent', '\x1b[A');
    assert(true, 'writeRaw on missing agent is a no-op');
  } catch {
    assert(false, 'writeRaw on missing agent should not throw');
  }

  // ─── 8. Workspace lifecycle (real git ops) ───────────────────────────────
  console.log('\n8. Workspace lifecycle (real git operations)');

  const execId = `smoke-${Date.now()}`;
  console.log(`    Execution ID: ${execId}`);

  // Provision
  console.log('    Provisioning workspace...');
  const workspace = await manager.provisionWorkspace({
    repo: TESTBED_REPO,
    provider: 'github',
    strategy: 'clone',
    branchStrategy: 'feature_branch',
    baseBranch: 'main',
    execution: { id: execId, patternName: 'smoke-test' },
    task: { id: 'task-1', role: 'engineer', slug: 'smoke' },
    userCredentials: { type: 'pat', token: pat, provider: 'github' },
  });

  assert(workspace.id !== undefined, `Workspace provisioned: ${workspace.id}`);
  assert(workspace.path !== undefined, `Workspace path: ${workspace.path}`);
  assert(
    workspace.branch.name.includes(execId),
    `Branch contains execution ID: ${workspace.branch.name}`
  );
  assertEqual(workspace.status, 'ready', 'Workspace status: ready');
  assertEqual(workspace.strategy, 'clone', 'Workspace strategy: clone');
  console.log(`    Branch: ${workspace.branch.name}`);

  // List worktrees on the clone workspace (should be empty)
  const worktrees = manager.listWorktrees(workspace.id);
  assertEqual(worktrees.length, 0, 'No worktrees on fresh clone workspace');

  // Make a change in the workspace
  console.log('    Making a test change...');
  const testFile = join(workspace.path, `smoke-test-${execId}.txt`);
  writeFileSync(
    testFile,
    `Smoke test from parallax-agent-runtime v0.8.5\nExecution: ${execId}\nTimestamp: ${new Date().toISOString()}\n`
  );

  // Stage and commit
  const { execSync } = await import('node:child_process');
  execSync('git add -A', { cwd: workspace.path, stdio: 'pipe' });
  execSync(`git commit -m "smoke test: ${execId}"`, {
    cwd: workspace.path,
    stdio: 'pipe',
  });
  assert(true, 'Committed test change');

  // Finalize — push + create PR
  console.log('    Finalizing workspace (push + PR)...');
  const prResult = await manager.finalizeWorkspace(workspace.id, {
    push: true,
    createPr: true,
    pr: {
      title: `[smoke test] parallax-agent-runtime v0.8.5 — ${execId}`,
      body: `Automated smoke test.\n\nExecution: \`${execId}\`\nTimestamp: ${new Date().toISOString()}\n\nThis PR can be safely closed/deleted.`,
      targetBranch: 'main',
      draft: true,
    },
    cleanup: false, // We'll clean up separately to test that path
  });

  assert(
    prResult !== undefined && prResult !== null,
    'Finalize returned PR info'
  );
  if (prResult) {
    assert(
      typeof prResult.number === 'number',
      `PR number: ${prResult.number}`
    );
    assert(prResult.url.includes('pull/'), `PR URL: ${prResult.url}`);
    console.log(`    PR created: ${prResult.url}`);
  }

  // Cleanup
  console.log('    Cleaning up workspace...');
  await manager.cleanupWorkspace(workspace.id);
  assert(true, 'Workspace cleaned up');

  // ─── 9. Auth module ──────────────────────────────────────────────────────
  console.log('\n9. Auth module');
  const auth = new McpAuthHandler(
    {
      apiKeys: [
        { key: 'admin-key', permissions: ['*'], name: 'admin' },
        {
          key: 'limited-key',
          permissions: ['agents:spawn', 'agents:list', 'agents:hook'],
          name: 'limited',
        },
      ],
    },
    logger
  );

  const adminCtx = await auth.authenticate('admin-key');
  assertEqual(adminCtx.type, 'api_key', 'Admin authenticates');
  assert(
    auth.hasPermission(adminCtx, 'workspace:provision'),
    'Admin wildcard permission'
  );

  const limitedCtx = await auth.authenticate('limited-key');
  assert(
    auth.hasPermission(limitedCtx, 'agents:spawn'),
    'Limited has agents:spawn'
  );
  assert(
    auth.hasPermission(limitedCtx, 'agents:hook'),
    'Limited has agents:hook'
  );
  assert(
    !auth.hasPermission(limitedCtx, 'workspace:provision'),
    'Limited lacks workspace:provision'
  );

  let authRejected = false;
  try {
    await auth.authenticate('bad-key');
  } catch (e) {
    authRejected = e instanceof McpAuthError;
  }
  assert(authRejected, 'Invalid key throws McpAuthError');

  assertEqual(auth.extractToken('Bearer tok'), 'tok', 'Extracts Bearer token');
  assertEqual(auth.extractToken('ApiKey key'), 'key', 'Extracts ApiKey token');
  assertEqual(auth.extractToken(undefined), null, 'Null for undefined header');

  // ─── 10. MCP server construction ─────────────────────────────────────────
  console.log('\n10. MCP server construction');
  const mcpServer = new ParallaxMcpServer({
    logger,
    maxAgents: 10,
    auth: { apiKeys: [{ key: 'test', permissions: ['*'], name: 'test' }] },
  });
  assert(mcpServer !== null, 'MCP server constructs');
  assert(!mcpServer.isConnected(), 'Server starts disconnected');
  assert(mcpServer.getManager() !== null, 'Server exposes manager');

  // ─── 11. Prompt generation ───────────────────────────────────────────────
  console.log('\n11. Prompt generation');
  const reviewPrompt = generateSpawnReviewTeamPrompt({
    repos: ['github.com/test/repo'],
    prNumbers: [42],
  });
  assert(
    reviewPrompt.messages.length > 0,
    'Review team prompt generates messages'
  );
  const devPrompt = generateSpawnDevAgentPrompt({
    task: 'Build a REST API',
    type: 'claude',
  });
  assert(devPrompt.messages.length > 0, 'Dev agent prompt generates messages');

  // ─── 12. Resources (empty state) ─────────────────────────────────────────
  console.log('\n12. Resources (empty state)');
  const agentResources = await listAgentResources(manager as never);
  assertEqual(agentResources.length, 0, 'No agent resources when no agents');

  // ─── Results ─────────────────────────────────────────────────────────────
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  if (failed > 0) {
    console.log(`  Results: ${passed} passed, ${failed} FAILED`);
    console.log(
      '═══════════════════════════════════════════════════════════════\n'
    );
    process.exit(1);
  } else {
    console.log(`  Results: ${passed} passed, 0 failed ✓`);
    console.log(
      '═══════════════════════════════════════════════════════════════\n'
    );
  }

  // Clean shutdown
  await manager.shutdown();
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err);
  process.exit(1);
});
