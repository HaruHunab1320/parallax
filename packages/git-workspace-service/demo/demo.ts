/**
 * Git Workspace Service Demo
 *
 * Demonstrates workspace provisioning, branch naming, and credential management.
 * Run with: npx tsx demo/demo.ts
 *
 * For full demo with GitHub API, set environment variables:
 *   GITHUB_APP_ID, GITHUB_PRIVATE_KEY
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  WorkspaceService,
  CredentialService,
  generateBranchName,
  parseBranchName,
  createBranchInfo,
  generateSlug,
  isManagedBranch,
} from '../src';

async function demoBranchNaming() {
  console.log('--- Branch Naming Utilities ---\n');

  // Generate branch names
  const branch1 = generateBranchName({
    executionId: 'exec-abc123',
    role: 'engineer',
    baseBranch: 'main',
  });
  console.log(`Basic branch: ${branch1}`);

  const branch2 = generateBranchName({
    executionId: 'exec-abc123',
    role: 'engineer',
    slug: 'auth-feature',
    baseBranch: 'main',
  });
  console.log(`With slug: ${branch2}`);

  const branch3 = generateBranchName(
    {
      executionId: 'exec-xyz789',
      role: 'reviewer',
      slug: 'code-review',
      baseBranch: 'develop',
    },
    { prefix: 'custom' }
  );
  console.log(`Custom prefix: ${branch3}`);

  // Parse branch names
  console.log('\nParsing branch names:');
  const parsed = parseBranchName('parallax/exec-abc123/engineer-auth-feature');
  console.log(`  Parsed: ${JSON.stringify(parsed)}`);

  // Check if managed
  console.log('\nManaged branch detection:');
  console.log(`  'parallax/exec-123/eng' is managed: ${isManagedBranch('parallax/exec-123/eng')}`);
  console.log(`  'feature/my-feature' is managed: ${isManagedBranch('feature/my-feature')}`);

  // Generate slugs
  console.log('\nSlug generation:');
  console.log(`  'Implement user authentication' -> '${generateSlug('Implement user authentication')}'`);
  console.log(`  'Fix bug #123 in login flow' -> '${generateSlug('Fix bug #123 in login flow')}'`);
}

async function demoCredentialService() {
  console.log('\n--- Credential Service ---\n');

  const credentialService = new CredentialService({
    defaultTtlSeconds: 3600,
    maxTtlSeconds: 7200,
    logger: {
      info: (data, msg) => console.log(`  [INFO] ${msg}`, data),
      warn: (data, msg) => console.log(`  [WARN] ${msg}`, data),
      error: (data, msg) => console.log(`  [ERROR] ${msg}`, data),
    },
  });

  // Request credentials with user-provided PAT
  console.log('Requesting credentials with user-provided PAT:\n');

  try {
    const credential = await credentialService.getCredentials({
      repo: 'https://github.com/octocat/Hello-World',
      access: 'read',
      context: {
        executionId: 'exec-demo-123',
        taskId: 'task-456',
        reason: 'Demo credential request',
      },
      userProvided: {
        type: 'pat',
        token: 'demo-token-xxx',
      },
    });

    console.log(`\nCredential granted:`);
    console.log(`  ID: ${credential.id}`);
    console.log(`  Type: ${credential.type}`);
    console.log(`  Provider: ${credential.provider}`);
    console.log(`  Permissions: ${credential.permissions.join(', ')}`);
    console.log(`  Expires: ${credential.expiresAt.toISOString()}`);
    console.log(`  Valid: ${credentialService.isValid(credential.id)}`);

    // Get grant info
    const grant = await credentialService.getGrant(credential.id);
    console.log(`\nGrant info:`);
    console.log(`  Granted to execution: ${grant?.grantedTo.executionId}`);
    console.log(`  Task: ${grant?.grantedTo.taskId}`);

    // Revoke
    console.log('\nRevoking credential...');
    await credentialService.revokeCredential(credential.id);
    console.log(`  Valid after revoke: ${credentialService.isValid(credential.id)}`);

  } catch (error) {
    console.log(`Error: ${(error as Error).message}`);
  }
}

async function demoWorkspaceService() {
  console.log('\n--- Workspace Service ---\n');

  // Create temp directory for demo
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-demo-'));
  console.log(`Demo workspace directory: ${tempDir}\n`);

  const credentialService = new CredentialService({
    defaultTtlSeconds: 3600,
  });

  const workspaceService = new WorkspaceService({
    config: {
      baseDir: tempDir,
      branchPrefix: 'demo',
    },
    credentialService,
    logger: {
      info: (data, msg) => console.log(`  [INFO] ${msg}`),
      warn: (data, msg) => console.log(`  [WARN] ${msg}`),
      error: (data, msg) => console.log(`  [ERROR] ${msg}`),
      debug: () => {},
    },
  });

  // Subscribe to events
  workspaceService.onEvent((event) => {
    console.log(`  [EVENT] ${event.type}`);
  });

  await workspaceService.initialize();

  // Show what would happen (without actually cloning)
  console.log('Workspace configuration example:\n');

  const config = {
    repo: 'https://github.com/octocat/Hello-World',
    branchStrategy: 'feature_branch' as const,
    baseBranch: 'main',
    execution: {
      id: 'exec-demo-456',
      patternName: 'code-review',
    },
    task: {
      id: 'task-789',
      role: 'engineer',
      slug: 'demo-feature',
    },
    userCredentials: {
      type: 'pat' as const,
      token: 'ghp_xxxxx',
    },
  };

  console.log('Would provision workspace with:');
  console.log(`  Repo: ${config.repo}`);
  console.log(`  Base branch: ${config.baseBranch}`);
  console.log(`  Branch: ${generateBranchName({
    executionId: config.execution.id,
    role: config.task.role,
    slug: config.task.slug,
    baseBranch: config.baseBranch,
  }, { prefix: 'demo' })}`);
  console.log(`  Execution: ${config.execution.id}`);
  console.log(`  Pattern: ${config.execution.patternName}`);

  // Create branch info to show what would be created
  const branchInfo = createBranchInfo({
    executionId: config.execution.id,
    role: config.task.role,
    slug: config.task.slug,
    baseBranch: config.baseBranch,
  }, { prefix: 'demo' });

  console.log('\nBranch info that would be created:');
  console.log(JSON.stringify(branchInfo, null, 2));

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log(`\nCleaned up temp directory`);
}

async function main() {
  console.log('=== Git Workspace Service Demo ===\n');

  await demoBranchNaming();
  await demoCredentialService();
  await demoWorkspaceService();

  console.log('\n=== Demo Complete ===');
  console.log('Demonstrated branch naming, credential management, and workspace setup.\n');

  // Note about full demo
  console.log('Note: To demo actual git operations (clone, push, PR creation),');
  console.log('set GITHUB_APP_ID and GITHUB_PRIVATE_KEY environment variables.\n');
}

main().catch(console.error);
