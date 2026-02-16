/**
 * Git Worktree Integration Test
 *
 * Tests worktree functionality against a real repository.
 * Run with: pnpm tsx demo/worktree-integration-test.ts
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
  const hasToken = !!process.env.GITHUB_TOKEN;

  try {
    await execAsync('ssh -T git@github.com 2>&1 || true');
    useSsh = true;
  } catch {
    // SSH not available
  }

  return { useSsh, hasToken };
}

async function main() {
  console.log('=== Git Worktree Integration Test ===\n');

  // Check git configuration
  console.log('Checking git configuration...');
  const { useSsh, hasToken } = await checkGitConfig();
  console.log(`  SSH available: ${useSsh}`);
  console.log(`  GITHUB_TOKEN: ${hasToken ? 'set' : 'not set'}`);

  if (!useSsh && !hasToken) {
    console.log('\n\x1b[33mWarning: No authentication method available.\x1b[0m');
    console.log('Set GITHUB_TOKEN or configure SSH key for GitHub.\n');
    process.exit(1);
  }

  const repoUrl = useSsh ? TEST_REPO_SSH : TEST_REPO_HTTPS;
  console.log(`\nUsing repo: ${repoUrl}\n`);

  // Create temp directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-worktree-test-'));
  console.log(`Workspace directory: ${tempDir}\n`);

  // Set up services
  const credentialService = new CredentialService({
    defaultTtlSeconds: 3600,
  });

  const workspaceService = new WorkspaceService({
    config: {
      baseDir: tempDir,
      branchPrefix: 'worktree-test',
    },
    credentialService,
    logger: {
      info: () => {},
      warn: (data, msg) => console.log(`    [WARN] ${msg}`),
      error: (data, msg) => console.log(`    [ERROR] ${msg}`),
      debug: () => {},
    },
  });

  await workspaceService.initialize();

  const executionId = `worktree-test-${Date.now()}`;
  const userCredentials = useSsh
    ? { type: 'ssh' as const }
    : hasToken
      ? { type: 'pat' as const, token: process.env.GITHUB_TOKEN! }
      : undefined;

  console.log('Running worktree tests...\n');

  let parentWorkspace: Awaited<ReturnType<typeof workspaceService.provision>> | null = null;
  let worktree1: Awaited<ReturnType<typeof workspaceService.provision>> | null = null;
  let worktree2: Awaited<ReturnType<typeof workspaceService.provision>> | null = null;

  // Test 1: Create parent clone workspace
  await runTest('Create parent clone workspace', async () => {
    parentWorkspace = await workspaceService.provision({
      repo: repoUrl,
      strategy: 'clone',
      branchStrategy: 'feature_branch',
      baseBranch: 'main',
      execution: {
        id: executionId,
        patternName: 'worktree-test',
      },
      task: {
        id: 'task-parent',
        role: 'architect',
        slug: 'main',
      },
      userCredentials,
    });

    if (!parentWorkspace) throw new Error('Parent workspace not created');
    if (parentWorkspace.strategy !== 'clone') throw new Error('Expected clone strategy');
    if (parentWorkspace.status !== 'ready') throw new Error(`Unexpected status: ${parentWorkspace.status}`);

    // Verify .git directory exists
    const gitDir = path.join(parentWorkspace.path, '.git');
    const stat = await fs.stat(gitDir);
    if (!stat.isDirectory()) throw new Error('.git is not a directory');
  });

  // Test 2: Add first worktree
  await runTest('Add first worktree', async () => {
    if (!parentWorkspace) throw new Error('No parent workspace');

    worktree1 = await workspaceService.provision({
      repo: repoUrl,
      strategy: 'worktree',
      parentWorkspace: parentWorkspace.id,
      branchStrategy: 'feature_branch',
      baseBranch: 'main',
      execution: {
        id: executionId,
        patternName: 'worktree-test',
      },
      task: {
        id: 'task-reviewer',
        role: 'reviewer',
        slug: 'review',
      },
      userCredentials,
    });

    if (!worktree1) throw new Error('Worktree 1 not created');
    if (worktree1.strategy !== 'worktree') throw new Error('Expected worktree strategy');
    if (worktree1.parentWorkspaceId !== parentWorkspace.id) throw new Error('Parent ID mismatch');

    // Verify worktree directory exists
    const stat = await fs.stat(worktree1.path);
    if (!stat.isDirectory()) throw new Error('Worktree directory not created');

    // Verify it's on the correct branch
    const { stdout } = await execAsync('git branch --show-current', { cwd: worktree1.path });
    if (stdout.trim() !== worktree1.branch.name) {
      throw new Error(`Branch mismatch: expected ${worktree1.branch.name}, got ${stdout.trim()}`);
    }
  });

  // Test 3: Add second worktree using convenience method
  await runTest('Add second worktree (convenience method)', async () => {
    if (!parentWorkspace) throw new Error('No parent workspace');

    worktree2 = await workspaceService.addWorktree(parentWorkspace.id, {
      branch: 'main',
      execution: {
        id: executionId,
        patternName: 'worktree-test',
      },
      task: {
        id: 'task-tester',
        role: 'tester',
        slug: 'test',
      },
    });

    if (!worktree2) throw new Error('Worktree 2 not created');
    if (worktree2.strategy !== 'worktree') throw new Error('Expected worktree strategy');
  });

  // Test 4: Verify worktrees are listed from parent
  await runTest('List worktrees from parent', async () => {
    if (!parentWorkspace) throw new Error('No parent workspace');

    const worktrees = workspaceService.listWorktrees(parentWorkspace.id);
    if (worktrees.length !== 2) {
      throw new Error(`Expected 2 worktrees, got ${worktrees.length}`);
    }
  });

  // Test 5: Verify git worktree list command
  await runTest('Verify git worktree list', async () => {
    if (!parentWorkspace) throw new Error('No parent workspace');

    const { stdout } = await execAsync('git worktree list', { cwd: parentWorkspace.path });
    const lines = stdout.trim().split('\n');

    // Should have 3 entries: main clone + 2 worktrees
    if (lines.length !== 3) {
      throw new Error(`Expected 3 worktree entries, got ${lines.length}:\n${stdout}`);
    }
  });

  // Test 6: Make changes in worktree 1
  await runTest('Make changes in worktree 1', async () => {
    if (!worktree1) throw new Error('No worktree 1');

    const testFile = path.join(worktree1.path, 'worktree1-test.txt');
    const content = `Worktree 1 test at ${new Date().toISOString()}\n`;
    await fs.writeFile(testFile, content);

    await execAsync('git add worktree1-test.txt', { cwd: worktree1.path });
    await execAsync('git commit -m "Test commit from worktree 1"', { cwd: worktree1.path });

    // Verify commit exists
    const { stdout } = await execAsync('git log --oneline -1', { cwd: worktree1.path });
    if (!stdout.includes('Test commit from worktree 1')) {
      throw new Error('Commit not found in worktree 1');
    }
  });

  // Test 7: Make changes in worktree 2
  await runTest('Make changes in worktree 2', async () => {
    if (!worktree2) throw new Error('No worktree 2');

    const testFile = path.join(worktree2.path, 'worktree2-test.txt');
    const content = `Worktree 2 test at ${new Date().toISOString()}\n`;
    await fs.writeFile(testFile, content);

    await execAsync('git add worktree2-test.txt', { cwd: worktree2.path });
    await execAsync('git commit -m "Test commit from worktree 2"', { cwd: worktree2.path });
  });

  // Test 8: Verify worktrees are isolated (different branches)
  await runTest('Verify worktrees have different branches', async () => {
    if (!worktree1 || !worktree2) throw new Error('Missing worktrees');

    const { stdout: branch1 } = await execAsync('git branch --show-current', { cwd: worktree1.path });
    const { stdout: branch2 } = await execAsync('git branch --show-current', { cwd: worktree2.path });

    if (branch1.trim() === branch2.trim()) {
      throw new Error('Worktrees should be on different branches');
    }
  });

  // Test 9: Verify credential sharing
  await runTest('Verify worktrees share parent credential', async () => {
    if (!parentWorkspace || !worktree1 || !worktree2) throw new Error('Missing workspaces');

    if (worktree1.credential.id !== parentWorkspace.credential.id) {
      throw new Error('Worktree 1 should share parent credential');
    }
    if (worktree2.credential.id !== parentWorkspace.credential.id) {
      throw new Error('Worktree 2 should share parent credential');
    }
  });

  // Test 10: Remove one worktree
  await runTest('Remove worktree 1', async () => {
    if (!worktree1 || !parentWorkspace) throw new Error('Missing workspaces');

    await workspaceService.removeWorktree(worktree1.id);

    // Verify worktree is cleaned up
    const ws = workspaceService.get(worktree1.id);
    if (ws?.status !== 'cleaned_up') {
      throw new Error('Worktree should be cleaned up');
    }

    // Verify directory is removed
    try {
      await fs.access(worktree1.path);
      throw new Error('Worktree directory should be removed');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Verify git worktree list updated
    const { stdout } = await execAsync('git worktree list', { cwd: parentWorkspace.path });
    if (stdout.includes(worktree1.path)) {
      throw new Error('Worktree should be removed from git worktree list');
    }
  });

  // Test 11: Cleanup parent (should cleanup remaining worktree)
  await runTest('Cleanup parent (cascades to worktrees)', async () => {
    if (!parentWorkspace || !worktree2) throw new Error('Missing workspaces');

    await workspaceService.cleanup(parentWorkspace.id);

    // Verify parent is cleaned up
    const parent = workspaceService.get(parentWorkspace.id);
    if (parent?.status !== 'cleaned_up') {
      throw new Error('Parent should be cleaned up');
    }

    // Verify worktree 2 is also cleaned up
    const wt2 = workspaceService.get(worktree2.id);
    if (wt2?.status !== 'cleaned_up') {
      throw new Error('Worktree 2 should be cleaned up via cascade');
    }

    // Verify directories are removed
    try {
      await fs.access(parentWorkspace.path);
      throw new Error('Parent directory should be removed');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  });

  // Cleanup temp directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

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

  console.log('\x1b[32mAll worktree integration tests passed!\x1b[0m\n');
}

main().catch((error) => {
  console.error('\x1b[31mIntegration test failed:\x1b[0m', error);
  process.exit(1);
});
