/**
 * Full Workflow Demo
 *
 * Demonstrates the complete git-workspace-service workflow:
 * 1. Provision a workspace (clone + branch)
 * 2. Add code changes
 * 3. Push and create a PR
 * 4. Create and manage issues
 *
 * Run with: GITHUB_TOKEN=ghp_xxx pnpm tsx demo/full-workflow.ts
 *
 * Prerequisites:
 *   - GITHUB_TOKEN environment variable with repo and issue permissions
 *   - @octokit/rest installed
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  WorkspaceService,
  CredentialService,
  GitHubPatClient,
} from '../src';

const TEST_REPO = 'HaruHunab1320/git-workspace-service-testbed';
const TEST_REPO_SSH = `git@github.com:${TEST_REPO}.git`;

async function main() {
  console.log('=== Git Workspace Service - Full Workflow Demo ===\n');

  // Check for GitHub token
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable required');
    console.log('\nUsage: GITHUB_TOKEN=ghp_xxx pnpm tsx demo/full-workflow.ts');
    console.log('\nToken needs: repo, issues permissions');
    process.exit(1);
  }

  // Create temp directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ws-workflow-'));
  console.log(`Workspace directory: ${tempDir}\n`);

  // Initialize services
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

  const github = new GitHubPatClient(
    { token },
    {
      info: (data, msg) => console.log(`  [GITHUB] ${msg}`),
      warn: (data, msg) => console.log(`  [GITHUB WARN] ${msg}`),
      error: (data, msg) => console.log(`  [GITHUB ERROR] ${msg}`),
    }
  );

  // Track events
  const events: string[] = [];
  workspaceService.onEvent((event) => {
    events.push(event.type);
    console.log(`  [EVENT] ${event.type}`);
  });

  await workspaceService.initialize();

  const executionId = `workflow-${Date.now()}`;
  const [owner, repo] = TEST_REPO.split('/');

  try {
    // ─────────────────────────────────────────────────────────────
    // Step 1: Provision Workspace
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Step 1: Provision Workspace ---\n');

    const workspace = await workspaceService.provision({
      repo: TEST_REPO_SSH,
      branchStrategy: 'feature_branch',
      baseBranch: 'main',
      execution: {
        id: executionId,
        patternName: 'full-workflow-demo',
      },
      task: {
        id: 'task-demo',
        role: 'developer',
        slug: 'add-feature',
      },
      userCredentials: {
        type: 'ssh',
      },
    });

    console.log(`\n  Workspace ID: ${workspace.id}`);
    console.log(`  Path: ${workspace.path}`);
    console.log(`  Branch: ${workspace.branch.name}`);

    // ─────────────────────────────────────────────────────────────
    // Step 2: Add Code Changes
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Step 2: Add Code Changes ---\n');

    // Create a new feature file
    const featureFile = path.join(workspace.path, 'src', 'feature.ts');
    await fs.mkdir(path.join(workspace.path, 'src'), { recursive: true });

    const featureCode = `/**
 * Example Feature
 *
 * Created by git-workspace-service demo
 * Execution: ${executionId}
 */

export function greet(name: string): string {
  return \`Hello, \${name}! Welcome to the demo.\`;
}

export function calculateSum(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

export const VERSION = '1.0.0';
`;

    await fs.writeFile(featureFile, featureCode);
    console.log(`  Created: src/feature.ts`);

    // Create a test file
    const testFile = path.join(workspace.path, 'src', 'feature.test.ts');
    const testCode = `import { greet, calculateSum } from './feature';

describe('feature', () => {
  it('should greet correctly', () => {
    expect(greet('World')).toBe('Hello, World! Welcome to the demo.');
  });

  it('should calculate sum', () => {
    expect(calculateSum([1, 2, 3])).toBe(6);
  });
});
`;

    await fs.writeFile(testFile, testCode);
    console.log(`  Created: src/feature.test.ts`);

    // Stage and commit
    execSync('git add -A', { cwd: workspace.path });
    execSync('git commit -m "feat: add example feature with tests"', {
      cwd: workspace.path,
    });
    console.log(`  Committed changes`);

    // ─────────────────────────────────────────────────────────────
    // Step 3: Push and Create PR
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Step 3: Push and Create PR ---\n');

    // Push branch
    execSync(`git push -u origin ${workspace.branch.name}`, {
      cwd: workspace.path,
    });
    console.log(`  Pushed branch to origin`);

    // Create PR using GitHub API
    const pr = await github.createPullRequest(owner, repo, {
      title: 'feat: Add example feature with tests',
      body: `## Summary

This PR adds an example feature module with tests.

### Changes
- Added \`src/feature.ts\` with \`greet\` and \`calculateSum\` functions
- Added \`src/feature.test.ts\` with unit tests

### Context
- Execution ID: \`${executionId}\`
- Created by: git-workspace-service demo

---
*Automated PR created by @parallax/git-workspace-service*`,
      head: workspace.branch.name,
      base: 'main',
      labels: ['enhancement', 'automated'],
    });

    console.log(`\n  PR created: #${pr.number}`);
    console.log(`  URL: ${pr.url}`);

    // ─────────────────────────────────────────────────────────────
    // Step 4: Create and Manage Issues
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Step 4: Create and Manage Issues ---\n');

    // Create an issue
    const issue = await github.createIssue(owner, repo, {
      title: 'Track: Feature implementation progress',
      body: `## Feature Tracking Issue

This issue tracks the progress of the feature implementation.

### Checklist
- [x] Create feature module
- [x] Add unit tests
- [x] Create pull request
- [ ] Code review
- [ ] Merge to main

### Related
- PR: #${pr.number}
- Execution: \`${executionId}\`

---
*Automated issue created by @parallax/git-workspace-service*`,
      labels: ['tracking', 'automated'],
    });

    console.log(`  Issue created: #${issue.number}`);
    console.log(`  URL: ${issue.url}`);

    // Add a comment to the issue
    const comment = await github.addComment(owner, repo, issue.number, {
      body: `PR #${pr.number} has been created for this feature.\n\nNext steps:\n1. Review the code\n2. Run tests\n3. Merge when ready`,
    });

    console.log(`  Added comment: ${comment.id}`);

    // Also comment on the PR linking to the issue
    await github.addComment(owner, repo, pr.number, {
      body: `Tracking issue: #${issue.number}`,
    });

    console.log(`  Linked PR to issue`);

    // ─────────────────────────────────────────────────────────────
    // Step 5: Summary
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Summary ---\n');

    console.log('Created:');
    console.log(`  - Workspace: ${workspace.id}`);
    console.log(`  - Branch: ${workspace.branch.name}`);
    console.log(`  - PR: #${pr.number} (${pr.url})`);
    console.log(`  - Issue: #${issue.number} (${issue.url})`);
    console.log(`\nEvents fired: ${events.join(', ')}`);

    // ─────────────────────────────────────────────────────────────
    // Cleanup (optional - comment out to keep resources)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- Cleanup ---\n');

    const cleanup = process.argv.includes('--cleanup');

    if (cleanup) {
      // Close the issue
      await github.closeIssue(owner, repo, issue.number);
      console.log(`  Closed issue #${issue.number}`);

      // Close the PR
      await github.updateIssue(owner, repo, pr.number, { state: 'closed' });
      console.log(`  Closed PR #${pr.number}`);

      // Delete the branch
      await github.deleteBranch(owner, repo, workspace.branch.name);
      console.log(`  Deleted branch ${workspace.branch.name}`);

      // Cleanup workspace
      await workspaceService.cleanup(workspace.id);
      console.log(`  Cleaned up workspace`);
    } else {
      console.log('  Skipping cleanup (run with --cleanup to clean up)');
      console.log(`  Resources left on GitHub for inspection:`);
      console.log(`    - PR: ${pr.url}`);
      console.log(`    - Issue: ${issue.url}`);
    }

    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`  Removed temp directory`);

    console.log('\n=== Workflow Complete ===\n');

  } catch (error) {
    console.error('\nWorkflow failed:', error);

    // Cleanup on error
    await fs.rm(tempDir, { recursive: true, force: true });

    process.exit(1);
  }
}

main().catch(console.error);
