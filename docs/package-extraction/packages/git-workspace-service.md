# Git Workspace Service Development Plan

**Package Name:** `@parallax/git-workspace-service`
**Current Location:** `packages/control-plane/src/workspace/`
**Extraction Difficulty:** Hard
**Estimated Effort:** 3-4 weeks
**Phase:** 3 (Complex Systems)

## Overview

An ephemeral git workspace provisioning system designed for AI agents and automated workflows. Handles repository cloning, branch creation with consistent naming, credential management, and PR creation. Designed for multi-tenant environments where many agents need isolated workspaces.

## Current Implementation

```
packages/control-plane/src/workspace/
├── workspace-service.ts       # 448 lines - Main service
├── credential-service.ts      # 465 lines - Credential management
├── git-credential-helper.ts   # Secure credential handling
├── branch-naming.ts           # Branch naming conventions
├── types.ts                   # 370 lines - Type definitions
└── providers/
    └── github-provider.ts     # GitHub API integration
```

### Core Concepts

```typescript
// Provision an isolated workspace for an agent
const workspace = await workspaceService.provision({
  repo: 'github.com/org/repo',
  branchStrategy: 'feature_branch',
  baseBranch: 'main',
  execution: { id: 'exec-123', patternName: 'code-review' },
  task: { id: 'task-456', role: 'engineer', slug: 'auth-fix' }
});

// workspace.path = '/workspaces/exec-123/task-456'
// workspace.branch.name = 'parallax/exec-123/engineer-auth-fix'

// After work is complete
await workspaceService.finalize(workspace.id, {
  push: true,
  createPr: true,
  pr: {
    title: 'feat: Add authentication fix',
    body: 'Automated PR from Parallax',
    targetBranch: 'main'
  },
  cleanup: true
});
```

## Target API

```typescript
// @parallax/git-workspace-service

import {
  WorkspaceService,
  CredentialService,
  GitHubProvider,
  createProvider
} from '@parallax/git-workspace-service';

// Setup credential provider
const credentialService = new CredentialService({
  providers: {
    github: new GitHubProvider({
      // GitHub App (recommended)
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
      // OR Personal Access Token
      // pat: process.env.GITHUB_TOKEN
    }),
    gitlab: createProvider('gitlab', {
      token: process.env.GITLAB_TOKEN
    })
  },
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 7200
});

// Create workspace service
const workspaces = new WorkspaceService({
  workspacesDir: '/var/workspaces',
  credentialService,
  branchNaming: {
    prefix: 'auto',
    format: '{prefix}/{executionId}/{role}-{slug}'
  },
  cleanup: {
    autoCleanupOnFinalize: true,
    maxWorkspaceAge: 86400000  // 24 hours
  }
});

await workspaces.initialize();

// Provision a workspace
const workspace = await workspaces.provision({
  repo: 'github.com/myorg/myrepo',
  provider: 'github',
  branchStrategy: 'feature_branch',
  baseBranch: 'main',
  context: {
    executionId: 'exec-123',
    taskId: 'task-456',
    role: 'engineer',
    slug: 'fix-auth'
  },
  // Optional: User-provided credentials override provider
  credentials: {
    type: 'pat',
    token: userProvidedToken
  }
});

console.log(workspace);
// {
//   id: 'ws-abc123',
//   path: '/var/workspaces/exec-123/task-456',
//   repo: 'github.com/myorg/myrepo',
//   branch: { name: 'auto/exec-123/engineer-fix-auth', ... },
//   status: 'ready',
//   credential: { expiresAt: Date, ... }
// }

// Use the workspace (your code runs git commands here)
// ...

// Finalize: push, create PR, cleanup
const pr = await workspaces.finalize(workspace.id, {
  push: true,
  createPr: true,
  pr: {
    title: 'feat: Fix authentication bug',
    body: 'Automated fix by AI agent',
    targetBranch: 'main',
    draft: false,
    labels: ['automated', 'bugfix'],
    reviewers: ['senior-dev']
  },
  cleanup: true
});

console.log(pr);
// { number: 42, url: 'https://github.com/myorg/myrepo/pull/42', ... }

// Query workspaces
const activeWorkspaces = workspaces.list({ status: 'ready' });
const executionWorkspaces = workspaces.getForExecution('exec-123');

// Manual cleanup
await workspaces.cleanup(workspace.id);
await workspaces.cleanupForExecution('exec-123');

// Events
workspaces.on('workspace:provisioned', ({ id, path }) => {});
workspaces.on('workspace:finalized', ({ id, pr }) => {});
workspaces.on('workspace:cleaned', ({ id }) => {});
workspaces.on('credential:expiring', ({ workspaceId, expiresAt }) => {});
```

## Development Phases

### Phase 1: Credential System (Week 1)

#### Day 1-2: Credential Interface
- [ ] Define `CredentialProvider` interface
- [ ] Define `CredentialService` interface
- [ ] Create provider registry

```typescript
interface CredentialProvider {
  name: string;

  /** Get credentials for a repository */
  getCredentials(
    repo: string,
    access: 'read' | 'write',
    ttlSeconds: number
  ): Promise<GitCredential>;

  /** Revoke credentials */
  revoke(credentialId: string): Promise<void>;

  /** Check if provider handles this repo */
  handles(repo: string): boolean;

  /** Validate provider configuration */
  validate(): Promise<boolean>;
}

interface GitCredential {
  id: string;
  type: 'pat' | 'oauth' | 'github_app' | 'deploy_key';
  token: string;
  expiresAt: Date;
  permissions: string[];
}
```

#### Day 3-4: GitHub Provider
- [ ] Extract GitHub App authentication
- [ ] Installation token generation
- [ ] Repository permission checking
- [ ] Token refresh handling

#### Day 5: Additional Providers
- [ ] GitLab provider (PAT-based)
- [ ] Generic Git provider (basic auth)
- [ ] Provider factory function

### Phase 2: Workspace Service (Week 2)

#### Day 1-2: Core Service
- [ ] Extract `WorkspaceService` class
- [ ] Workspace provisioning flow
- [ ] Directory management
- [ ] Status tracking

#### Day 3-4: Branch Management
- [ ] Extract branch naming conventions
- [ ] Branch creation/deletion
- [ ] Remote tracking setup
- [ ] Conflict detection

#### Day 5: Git Operations
- [ ] Clone operations
- [ ] Push with credentials
- [ ] Credential helper setup
- [ ] Error handling

### Phase 3: PR & Finalization (Week 3)

#### Day 1-2: PR Creation
- [ ] PR creation via provider API
- [ ] Draft PR support
- [ ] Labels and reviewers
- [ ] PR template support

#### Day 3: Workspace Lifecycle
- [ ] Finalization flow
- [ ] Cleanup procedures
- [ ] TTL-based auto-cleanup
- [ ] Error recovery

#### Day 4-5: Multi-tenancy
- [ ] Execution-scoped workspaces
- [ ] Credential isolation
- [ ] Concurrent workspace limits
- [ ] Resource quotas

### Phase 4: Testing & Polish (Week 4)

#### Day 1-2: Unit Tests
- [ ] Credential service tests
- [ ] Workspace service tests
- [ ] Branch naming tests
- [ ] Mock providers

#### Day 3: Integration Tests
- [ ] Real GitHub API tests (CI)
- [ ] Clone/push/PR workflow
- [ ] Credential expiration handling
- [ ] Cleanup verification

#### Day 4-5: Documentation & Publish
- [ ] Comprehensive README
- [ ] Provider development guide
- [ ] Security best practices
- [ ] npm publish

## Package Structure

```
@parallax/git-workspace-service/
├── src/
│   ├── index.ts                      # Public exports
│   ├── workspace-service.ts          # Main service
│   ├── types.ts                      # TypeScript interfaces
│   ├── credentials/
│   │   ├── credential-service.ts     # Credential management
│   │   ├── credential-helper.ts      # Git credential helper
│   │   └── provider.interface.ts     # Provider interface
│   ├── providers/
│   │   ├── github.provider.ts        # GitHub App/PAT
│   │   ├── gitlab.provider.ts        # GitLab
│   │   ├── generic.provider.ts       # Basic auth
│   │   └── factory.ts                # createProvider()
│   ├── git/
│   │   ├── git-client.ts             # Git command wrapper
│   │   ├── branch-naming.ts          # Branch conventions
│   │   └── operations.ts             # Clone, push, etc.
│   └── lifecycle/
│       ├── provisioner.ts            # Workspace creation
│       ├── finalizer.ts              # Push, PR, cleanup
│       └── cleanup.ts                # Resource cleanup
├── tests/
│   ├── credentials/
│   ├── providers/
│   ├── git/
│   └── integration/
├── examples/
│   ├── basic-workflow.ts
│   ├── with-github-app.ts
│   ├── custom-provider.ts
│   └── multi-workspace.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── SECURITY.md
└── LICENSE
```

## API Reference

### `WorkspaceService`

```typescript
class WorkspaceService extends EventEmitter {
  constructor(config: WorkspaceServiceConfig)

  /** Initialize service (required before use) */
  initialize(): Promise<void>

  /** Provision a new workspace */
  provision(config: ProvisionConfig): Promise<Workspace>

  /** Finalize workspace (push, PR, cleanup) */
  finalize(
    workspaceId: string,
    options: FinalizeOptions
  ): Promise<PullRequestInfo | void>

  /** Get workspace by ID */
  get(workspaceId: string): Workspace | null

  /** List workspaces with optional filter */
  list(filter?: WorkspaceFilter): Workspace[]

  /** Get workspaces for an execution */
  getForExecution(executionId: string): Workspace[]

  /** Cleanup a workspace */
  cleanup(workspaceId: string): Promise<void>

  /** Cleanup all workspaces for an execution */
  cleanupForExecution(executionId: string): Promise<void>

  /** Shutdown service */
  shutdown(): Promise<void>
}
```

### `ProvisionConfig`

```typescript
interface ProvisionConfig {
  /** Repository URL or identifier */
  repo: string;

  /** Git provider (auto-detected if not specified) */
  provider?: string;

  /** Branch strategy */
  branchStrategy: 'feature_branch' | 'fork' | 'direct';

  /** Base branch to create from */
  baseBranch: string;

  /** Context for branch naming and tracking */
  context: {
    executionId: string;
    taskId: string;
    role: string;
    slug?: string;
  };

  /** User-provided credentials (override provider) */
  credentials?: {
    type: 'pat' | 'oauth';
    token: string;
  };

  /** Requested credential TTL */
  credentialTtlSeconds?: number;
}
```

### `Workspace`

```typescript
interface Workspace {
  id: string;
  path: string;
  repo: string;
  provider: string;
  branch: BranchInfo;
  credential: GitCredential;
  status: WorkspaceStatus;
  provisionedAt: Date;
  context: WorkspaceContext;
}

type WorkspaceStatus =
  | 'provisioning'
  | 'ready'
  | 'in_use'
  | 'finalizing'
  | 'cleaned_up'
  | 'error';

interface BranchInfo {
  name: string;
  baseBranch: string;
  createdAt: Date;
  remote?: string;
}
```

### `CredentialService`

```typescript
class CredentialService {
  constructor(config: CredentialServiceConfig)

  /** Initialize all providers */
  initialize(): Promise<void>

  /** Get credentials for a repository */
  getCredentials(request: CredentialRequest): Promise<GitCredential>

  /** Revoke a credential */
  revoke(credentialId: string): Promise<void>

  /** Revoke all credentials for an execution */
  revokeForExecution(executionId: string): Promise<void>

  /** Get grant audit info */
  getGrant(grantId: string): Promise<CredentialGrant | null>

  /** Register a provider */
  registerProvider(provider: CredentialProvider): void
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `workspace:provisioning` | `{ id, repo, context }` | Provisioning started |
| `workspace:provisioned` | `{ id, path, branch }` | Workspace ready |
| `workspace:finalized` | `{ id, pr? }` | Finalization complete |
| `workspace:cleaned` | `{ id }` | Cleanup complete |
| `workspace:error` | `{ id, error }` | Error occurred |
| `credential:granted` | `{ id, repo, expiresAt }` | Credential issued |
| `credential:expiring` | `{ id, expiresAt }` | Credential near expiry |
| `credential:revoked` | `{ id }` | Credential revoked |

## Branch Naming

Default format: `{prefix}/{executionId}/{role}-{slug}`

```typescript
const config = {
  branchNaming: {
    prefix: 'parallax',           // or 'auto', 'pr', etc.
    format: '{prefix}/{executionId}/{role}-{slug}',
    slugify: true,                // Clean slug characters
    maxLength: 100                // Max branch name length
  }
};

// Examples:
// parallax/exec-abc123/engineer-fix-auth
// parallax/exec-abc123/reviewer-code-review
// auto/exec-xyz789/lead-approve-pr
```

## Security Considerations

### Credential Handling

```typescript
// Credentials are NEVER written to disk unencrypted
// Git credential helper injects credentials at runtime

const workspace = await workspaces.provision({...});
// workspace.credential.token is available only in memory

// When git needs credentials:
// 1. Credential helper is invoked
// 2. Token is injected for that specific operation
// 3. Token is NOT stored in .git/config
```

### Best Practices

1. **Use GitHub App** over PATs when possible (scoped permissions)
2. **Short TTLs** for credentials (default: 1 hour)
3. **Revoke on cleanup** - credentials are revoked when workspace is cleaned
4. **Audit trail** - all credential grants are logged
5. **Execution isolation** - workspaces are isolated per execution

## Migration Guide

### Before (Parallax Internal)

```typescript
import { WorkspaceService } from '../workspace/workspace-service';
import { CredentialService } from '../workspace/credential-service';

const credService = new CredentialService(config, logger);
const workspaces = new WorkspaceService(config, credService, logger);

const workspace = await workspaces.provision({
  repo: 'github.com/org/repo',
  execution: { id: 'exec-1', patternName: 'review' },
  task: { id: 'task-1', role: 'engineer' },
  // ... Parallax-specific options
});
```

### After (@parallax/git-workspace-service)

```typescript
import {
  WorkspaceService,
  CredentialService,
  GitHubProvider
} from '@parallax/git-workspace-service';

const credService = new CredentialService({
  providers: {
    github: new GitHubProvider({ appId, privateKey })
  }
});

const workspaces = new WorkspaceService({
  workspacesDir: '/workspaces',
  credentialService: credService
});

const workspace = await workspaces.provision({
  repo: 'github.com/org/repo',
  branchStrategy: 'feature_branch',
  baseBranch: 'main',
  context: {
    executionId: 'exec-1',
    taskId: 'task-1',
    role: 'engineer'
  }
});
```

## Dependencies

**Runtime:**
- `execa` ^8.0.0 (git command execution)
- `@octokit/rest` ^20.0.0 (GitHub API, optional)
- `@octokit/auth-app` ^6.0.0 (GitHub App auth, optional)

**Development:**
- `typescript` ^5.0.0
- `vitest` ^2.0.0
- `tsup` (bundling)

## Provider Support

| Provider | Auth Methods | PR Support |
|----------|--------------|------------|
| GitHub | App, PAT, OAuth | Full |
| GitLab | PAT, OAuth | Full |
| Bitbucket | PAT, OAuth | Planned |
| Azure DevOps | PAT | Planned |
| Generic | Basic Auth | None |

## Success Criteria

- [ ] Pluggable credential providers
- [ ] GitHub App support (recommended)
- [ ] PAT/OAuth fallback support
- [ ] Secure credential handling (no disk storage)
- [ ] Branch naming conventions
- [ ] PR creation with full options
- [ ] Auto-cleanup with TTL
- [ ] 85%+ test coverage
- [ ] Security documentation
- [ ] Multi-provider support
