# @parallax/git-workspace-service

Git workspace provisioning and credential management service. Handles cloning repositories, managing branches, credentials, and PR creation.

## Features

- **Workspace provisioning** - Clone repos, create branches, configure git
- **Credential management** - Secure credential handling with TTL and revocation
- **Multiple providers** - Support for GitHub, GitLab, Bitbucket, Azure DevOps
- **GitHub App support** - First-class GitHub App authentication
- **OAuth Device Flow** - Interactive authentication for CLI/agents (RFC 8628)
- **Token caching** - Encrypted persistent storage for OAuth tokens
- **User credentials** - Support for PAT, OAuth tokens, and SSH
- **Fine-grained permissions** - Control what agents can do
- **Branch naming** - Automatic branch naming with execution context
- **PR & Issue management** - Create PRs, manage issues, add comments
- **Event system** - Subscribe to workspace lifecycle events
- **TypeScript-first** - Full type definitions included

## Installation

```bash
npm install @parallax/git-workspace-service
# or
pnpm add @parallax/git-workspace-service
```

For GitHub App support, also install:
```bash
npm install @octokit/rest @octokit/auth-app
```

## Quick Start

```typescript
import {
  WorkspaceService,
  CredentialService,
  GitHubProvider,
} from '@parallax/git-workspace-service';

// Set up credential service with GitHub provider
const githubProvider = new GitHubProvider({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_PRIVATE_KEY!,
});
await githubProvider.initialize();

const credentialService = new CredentialService({
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 7200,
});
credentialService.registerProvider(githubProvider);

// Create workspace service
const workspaceService = new WorkspaceService({
  config: {
    baseDir: '/tmp/workspaces',
  },
  credentialService,
});
await workspaceService.initialize();

// Provision a workspace
const workspace = await workspaceService.provision({
  repo: 'https://github.com/owner/repo',
  branchStrategy: 'feature_branch',
  baseBranch: 'main',
  execution: {
    id: 'exec-123',
    patternName: 'code-review',
  },
  task: {
    id: 'task-456',
    role: 'engineer',
    slug: 'auth-feature',
  },
});

console.log(`Workspace created at: ${workspace.path}`);
console.log(`Branch: ${workspace.branch.name}`);

// Do work in the workspace...

// Finalize with PR
const pr = await workspaceService.finalize(workspace.id, {
  push: true,
  createPr: true,
  pr: {
    title: 'Add authentication feature',
    body: 'Implements OAuth login',
    targetBranch: 'main',
    labels: ['enhancement'],
  },
  cleanup: true,
});

console.log(`PR created: ${pr?.url}`);
```

## User-Provided Credentials

Instead of using GitHub App, users can provide their own PAT or OAuth token:

```typescript
const workspace = await workspaceService.provision({
  repo: 'https://github.com/owner/repo',
  branchStrategy: 'feature_branch',
  baseBranch: 'main',
  execution: {
    id: 'exec-123',
    patternName: 'my-pattern',
  },
  task: {
    id: 'task-456',
    role: 'engineer',
  },
  userCredentials: {
    type: 'pat',
    token: 'ghp_xxxx...',
  },
});
```

Or use SSH authentication (relies on system SSH agent):

```typescript
const workspace = await workspaceService.provision({
  repo: 'git@github.com:owner/repo.git',
  // ...
  userCredentials: {
    type: 'ssh',
  },
});
```

## OAuth Device Flow

For CLI applications and AI agents, use the OAuth Device Code Flow for interactive authentication:

```typescript
import {
  CredentialService,
  OAuthDeviceFlow,
  FileTokenStore,
  DEFAULT_AGENT_PERMISSIONS,
} from '@parallax/git-workspace-service';

// Set up token store for persistent caching (with encryption)
const tokenStore = new FileTokenStore({
  directory: '~/.myapp/tokens',
  encryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
});

// Create credential service with OAuth support
const credentialService = new CredentialService({
  tokenStore,
  oauth: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    permissions: DEFAULT_AGENT_PERMISSIONS,
    promptEmitter: {
      onAuthRequired(prompt) {
        console.log(`Visit: ${prompt.verificationUri}`);
        console.log(`Enter code: ${prompt.userCode}`);
      },
      onAuthComplete(result) {
        if (result.success) {
          console.log('Authenticated!');
        }
      },
    },
  },
});

// Request credentials - will use cached token or trigger device flow
const credential = await credentialService.getCredentials({
  repo: 'https://github.com/owner/repo',
  access: 'write',
  context: {
    executionId: 'exec-123',
    taskId: 'task-456',
    reason: 'Code review',
  },
});
```

### Credential Priority

When requesting credentials, the service checks sources in this order:

1. **User-provided** - PAT, OAuth token, or SSH credentials passed directly
2. **Cached OAuth** - Valid token from TokenStore (with auto-refresh)
3. **Provider** - GitHub App or other registered provider
4. **OAuth Device Flow** - Interactive authentication (if configured)

### Fine-Grained Permissions

Control what agents can do with `AgentPermissions`:

```typescript
import { DEFAULT_AGENT_PERMISSIONS } from '@parallax/git-workspace-service';

const permissions = {
  repositories: { type: 'selected', repos: ['owner/repo'] },
  contents: 'write',      // 'none' | 'read' | 'write'
  pullRequests: 'write',
  issues: 'read',
  metadata: 'read',
  canDeleteBranch: true,
  canForcePush: false,    // Dangerous operations off by default
  canDeleteRepository: false,
  canAdminister: false,
};
```

## Event System

Subscribe to workspace lifecycle events:

```typescript
const unsubscribe = workspaceService.onEvent((event) => {
  switch (event.type) {
    case 'workspace:provisioning':
      console.log('Provisioning workspace...');
      break;
    case 'workspace:ready':
      console.log('Workspace ready!');
      break;
    case 'credential:granted':
      console.log(`Credential ${event.credentialId} granted`);
      break;
    case 'pr:created':
      console.log(`PR created: ${event.data?.prUrl}`);
      break;
    case 'workspace:cleaned_up':
      console.log('Workspace cleaned up');
      break;
  }
});

// Later, unsubscribe
unsubscribe();
```

## Branch Naming

Automatic branch naming with customizable prefix:

```typescript
import { generateBranchName, parseBranchName } from '@parallax/git-workspace-service';

// Generate branch name
const branchName = generateBranchName({
  executionId: 'exec-123',
  role: 'engineer',
  slug: 'auth-feature',
  baseBranch: 'main',
});
// Result: 'parallax/exec-123/engineer-auth-feature'

// Parse branch name
const parsed = parseBranchName('parallax/exec-123/engineer-auth-feature');
// Result: { executionId: 'exec-123', role: 'engineer', slug: 'auth-feature' }
```

## API Reference

### WorkspaceService

```typescript
class WorkspaceService {
  constructor(options: WorkspaceServiceOptions);

  // Initialize the service
  initialize(): Promise<void>;

  // Provision a new workspace
  provision(config: WorkspaceConfig): Promise<Workspace>;

  // Finalize workspace (push, create PR, cleanup)
  finalize(workspaceId: string, options: WorkspaceFinalization): Promise<PullRequestInfo | void>;

  // Get workspace by ID
  get(workspaceId: string): Workspace | null;

  // Get all workspaces for an execution
  getForExecution(executionId: string): Workspace[];

  // Clean up a workspace
  cleanup(workspaceId: string): Promise<void>;

  // Clean up all workspaces for an execution
  cleanupForExecution(executionId: string): Promise<void>;

  // Subscribe to events
  onEvent(handler: WorkspaceEventHandler): () => void;
}
```

### CredentialService

```typescript
class CredentialService {
  constructor(options?: CredentialServiceOptions);

  // Register a provider adapter
  registerProvider(provider: GitProviderAdapter): void;

  // Get credentials for a repository
  getCredentials(request: GitCredentialRequest): Promise<GitCredential>;

  // Revoke a credential
  revokeCredential(grantId: string): Promise<void>;

  // Revoke all credentials for an execution
  revokeForExecution(executionId: string): Promise<number>;

  // Check if a credential is valid
  isValid(grantId: string): boolean;

  // Get grant info
  getGrant(grantId: string): Promise<CredentialGrant | null>;

  // Get all grants for an execution
  getGrantsForExecution(executionId: string): Promise<CredentialGrant[]>;
}
```

### GitHubProvider

```typescript
class GitHubProvider implements GitProviderAdapter {
  constructor(config: GitHubProviderConfig, logger?: GitHubProviderLogger);

  // Initialize and fetch installations
  initialize(): Promise<void>;

  // Register an installation
  registerInstallation(installationId: number): Promise<GitHubAppInstallation>;

  // Get credentials for a repo
  getCredentialsForRepo(owner: string, repo: string, access: 'read' | 'write', ttlSeconds?: number): Promise<GitCredential>;

  // Create a PR
  createPullRequestForRepo(owner: string, repo: string, options: { title, body, head, base, draft?, labels?, reviewers? }): Promise<PullRequestInfo>;

  // Delete a branch
  deleteBranch(owner: string, repo: string, branch: string): Promise<void>;

  // List managed branches
  listManagedBranches(owner: string, repo: string, prefix?: string): Promise<string[]>;
}
```

### OAuthDeviceFlow

```typescript
class OAuthDeviceFlow {
  constructor(config: OAuthDeviceFlowConfig, logger?: OAuthDeviceFlowLogger);

  // Start device flow and wait for authorization
  authorize(): Promise<OAuthToken>;

  // Request a device code (step 1)
  requestDeviceCode(): Promise<DeviceCodeResponse>;

  // Poll for token (step 2)
  pollForToken(deviceCode: DeviceCodeResponse): Promise<OAuthToken>;

  // Refresh an expired token
  refreshToken(refreshToken: string): Promise<OAuthToken>;
}
```

### TokenStore

```typescript
// Abstract base class
abstract class TokenStore {
  save(provider: GitProvider, token: OAuthToken): Promise<void>;
  get(provider: GitProvider): Promise<OAuthToken | null>;
  clear(provider?: GitProvider): Promise<void>;
  list(): Promise<GitProvider[]>;
  isExpired(token: OAuthToken): boolean;
  needsRefresh(token: OAuthToken): boolean;
}

// In-memory store (for testing)
class MemoryTokenStore extends TokenStore { }

// File-based store with encryption
class FileTokenStore extends TokenStore {
  constructor(options?: {
    directory?: string;      // Default: ~/.parallax/tokens
    encryptionKey?: string;  // AES-256-CBC encryption
  });
}
```

## Event Types

| Event | Description |
|-------|-------------|
| `workspace:provisioning` | Workspace provisioning started |
| `workspace:ready` | Workspace is ready for use |
| `workspace:error` | Workspace provisioning failed |
| `workspace:finalizing` | Workspace finalization started |
| `workspace:cleaned_up` | Workspace has been cleaned up |
| `credential:granted` | Credential was granted |
| `credential:revoked` | Credential was revoked |
| `pr:created` | Pull request was created |
| `pr:merged` | Pull request was merged |

## License

MIT
