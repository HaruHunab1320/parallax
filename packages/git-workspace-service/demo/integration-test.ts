/**
 * Git Workspace Service Integration Test
 *
 * Tests the full workspace lifecycle against a real repository.
 * Run with: pnpm tsx demo/integration-test.ts
 *
 * Prerequisites:
 *   - Git configured with SSH key or credentials for GitHub
 *   - Optional: GITHUB_TOKEN env var for PAT-based auth
 *
 * Test repo: git@github.com:HaruHunab1320/git-workspace-service-testbed.git
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import {
  WorkspaceService,
  CredentialService,
  generateBranchName,
} from '../src';

const execAsync = promisify(exec);

const TEST_REPO_SSH = 'git@github.com:HaruHunab1320/git-workspace-service-testbed.git';
const TEST_REPO_HTTPS = 'https://github.com/HaruHunab1320/git-workspace-service-testbed.git';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  process.stdout.write(`  ${name}... `);

  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`\x1b[32mPASSED\x1b[0m (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`\x1b[31mFAILED\x1b[0m (${duration}ms)`);
    console.log(`    Error: ${errorMsg}`);
  }
}

async function checkGitConfig(): Promise<{ useSsh: boolean; hasToken: boolean }> {
  let useSsh = false;
  let hasToken = !!process.env.GITHUB_TOKEN;

  // Check for SSH key
  try {
    await execAsync('ssh -T git@github.com 2>&1 || true');
    useSsh = true;
  } catch {
    // SSH not available
  }

  return { useSsh, hasToken };
}

async function main() {
  console.log('=== Git Workspace Service Integration Test ===\n');

  // Check git configuration
  console.log('Checking git configuration...');
  const { useSsh, hasToken } = await checkGitConfig();
  console.log(`  SSH available: ${useSsh}`);
  console.log(`  GITHUB_TOKEN: ${hasToken ? 'set' : 'not set'}`);

  if (!useSsh && !hasToken) {
    console.log('\n\x1b[33mWarning: No authentication method available.\x1b[0m');
    console.log('Set GITHUB_TOKEN or configure SSH key for GitHub.\n');
  }

  const repoUrl = useSsh ? TEST_REPO_SSH : TEST_REPO_HTTPS;
  console.log(`\nUsing repo: ${repoUrl}\n`);

  // Create temp directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ws-integration-'));
  console.log(`Workspace directory: ${tempDir}\n`);

  // Set up services
  const credentialService = new CredentialService({
    defaultTtlSeconds: 3600,
  });

  const workspaceService = new WorkspaceService({
    config: {
      baseDir: tempDir,
      branchPrefix: 'test',
    },
    credentialService,
    logger: {
      info: () => {},
      warn: (data, msg) => console.log(`    [WARN] ${msg}`),
      error: (data, msg) => console.log(`    [ERROR] ${msg}`),
      debug: () => {},
    },
  });

  const events: string[] = [];
  workspaceService.onEvent((event) => {
    events.push(event.type);
  });

  await workspaceService.initialize();

  const executionId = `integration-${Date.now()}`;
  const branchName = generateBranchName(
    {
      executionId,
      role: 'test',
      slug: 'integration',
      baseBranch: 'main',
    },
    { prefix: 'test' }
  );

  console.log('Running tests...\n');

  let workspace: Awaited<ReturnType<typeof workspaceService.provision>> | null = null;

  // Test 1: Provision workspace
  await runTest('Provision workspace (clone repo)', async () => {
    // Determine credentials based on available auth methods
    const userCredentials = useSsh
      ? { type: 'ssh' as const }
      : hasToken
        ? { type: 'pat' as const, token: process.env.GITHUB_TOKEN! }
        : undefined;

    if (!userCredentials) {
      throw new Error('No authentication method available (SSH or GITHUB_TOKEN)');
    }

    workspace = await workspaceService.provision({
      repo: repoUrl,
      branchStrategy: 'feature_branch',
      baseBranch: 'main',
      execution: {
        id: executionId,
        patternName: 'integration-test',
      },
      task: {
        id: 'task-integration',
        role: 'test',
        slug: 'integration',
      },
      userCredentials,
    });

    if (!workspace) throw new Error('Workspace not created');
    if (workspace.status !== 'ready') throw new Error(`Unexpected status: ${workspace.status}`);
  });

  // Test 2: Verify workspace structure
  await runTest('Verify workspace structure', async () => {
    if (!workspace) throw new Error('No workspace');

    const gitDir = path.join(workspace.path, '.git');
    const stat = await fs.stat(gitDir);
    if (!stat.isDirectory()) throw new Error('.git is not a directory');

    // Check branch
    const { stdout } = await execAsync('git branch --show-current', {
      cwd: workspace.path,
    });
    if (stdout.trim() !== workspace.branch.name) {
      throw new Error(`Branch mismatch: expected ${workspace.branch.name}, got ${stdout.trim()}`);
    }
  });

  // Test 3: Make changes in workspace
  await runTest('Make changes in workspace', async () => {
    if (!workspace) throw new Error('No workspace');

    const testFile = path.join(workspace.path, 'test-output.txt');
    const content = `Integration test run at ${new Date().toISOString()}\nExecution: ${executionId}\n`;
    await fs.writeFile(testFile, content);

    // Stage and commit
    await execAsync('git add test-output.txt', { cwd: workspace.path });
    await execAsync('git commit -m "Integration test commit"', { cwd: workspace.path });
  });

  // Test 4: Push changes
  await runTest('Push changes to remote', async () => {
    if (!workspace) throw new Error('No workspace');

    await execAsync(`git push -u origin ${workspace.branch.name}`, {
      cwd: workspace.path,
    });
  });

  // Test 5: Verify push
  await runTest('Verify branch exists on remote', async () => {
    if (!workspace) throw new Error('No workspace');

    const { stdout } = await execAsync(`git ls-remote --heads origin ${workspace.branch.name}`, {
      cwd: workspace.path,
    });
    if (!stdout.includes(workspace.branch.name)) {
      throw new Error('Branch not found on remote');
    }
  });

  // Test 6: Get workspace by ID
  await runTest('Get workspace by ID', async () => {
    if (!workspace) throw new Error('No workspace');

    const retrieved = workspaceService.get(workspace.id);
    if (!retrieved) throw new Error('Workspace not found');
    if (retrieved.id !== workspace.id) throw new Error('ID mismatch');
  });

  // Test 7: Get workspaces for execution
  await runTest('Get workspaces for execution', async () => {
    const workspaces = workspaceService.getForExecution(executionId);
    if (workspaces.length !== 1) throw new Error(`Expected 1 workspace, got ${workspaces.length}`);
  });

  // Test 8: Events fired correctly
  await runTest('Events fired correctly', async () => {
    const expected = ['workspace:provisioning', 'credential:granted', 'workspace:ready'];
    for (const event of expected) {
      if (!events.includes(event)) {
        throw new Error(`Missing event: ${event}`);
      }
    }
  });

  // Test 9: Cleanup workspace
  await runTest('Cleanup workspace', async () => {
    if (!workspace) throw new Error('No workspace');

    await workspaceService.cleanup(workspace.id);

    // Verify directory is gone
    try {
      await fs.access(workspace.path);
      throw new Error('Workspace directory still exists');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  });

  // Test 10: Delete remote branch (cleanup)
  await runTest('Delete remote branch (cleanup)', async () => {
    // Clone fresh to delete the branch
    const cleanupDir = path.join(tempDir, 'cleanup');
    await fs.mkdir(cleanupDir, { recursive: true });

    await execAsync(`git clone --depth 1 ${repoUrl} repo`, { cwd: cleanupDir });
    await execAsync(`git push origin --delete ${branchName}`, {
      cwd: path.join(cleanupDir, 'repo'),
    });
  });

  // Cleanup temp directory
  await fs.rm(tempDir, { recursive: true, force: true });

  // Print summary
  console.log('\n=== Test Summary ===\n');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${results.length} tests`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  if (failed > 0) {
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  }
  console.log(`Duration: ${totalDuration}ms\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
    process.exit(1);
  }

  console.log('\x1b[32mAll integration tests passed!\x1b[0m\n');
}

main().catch((error) => {
  console.error('\x1b[31mIntegration test failed:\x1b[0m', error);
  process.exit(1);
});
