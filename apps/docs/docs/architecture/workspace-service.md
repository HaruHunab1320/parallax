---
sidebar_position: 6
title: Workspace Service
description: Git workspace provisioning, credential management, and PR creation
---

# Workspace Service

The Workspace Service provisions isolated git workspaces for AI agents, handles credential management, and automates pull request creation.

## Overview

```mermaid
flowchart TB
    subgraph PatternExecution["Pattern Execution"]
        PE[Pattern Engine]
        AGENT[AI Agent]
    end

    subgraph WorkspaceService["Workspace Service"]
        WS[Workspace Manager]
        CRED[Credential Service]
        GH[GitHub Provider]
    end

    subgraph Git["Git Operations"]
        CLONE[Clone Repo]
        BRANCH[Create Branch]
        PUSH[Push Changes]
        PR[Create PR]
    end

    subgraph Storage["Storage"]
        DIR[Workspace Directory]
        HELPER[Credential Helper]
    end

    PE -->|provision| WS
    WS -->|request credentials| CRED
    CRED -->|get token| GH

    WS --> CLONE
    CLONE --> DIR
    WS --> BRANCH

    AGENT -->|works in| DIR

    PE -->|finalize| WS
    WS --> PUSH
    WS --> PR
    PR --> GH

    HELPER -->|provides auth| DIR
```

## Workspace Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Provisioning: provision()
    Provisioning --> Ready: Clone & branch success
    Provisioning --> Error: Clone failed

    Ready --> AgentWorking: Agent starts task
    AgentWorking --> Ready: Task complete

    Ready --> Finalizing: finalize()
    Finalizing --> Ready: Keep workspace
    Finalizing --> CleanedUp: Cleanup requested

    Error --> CleanedUp: cleanup()
    CleanedUp --> [*]
```

## Provisioning Workspaces

When a pattern executes, the Pattern Engine requests a workspace for each agent:

```typescript
const workspace = await workspaceService.provision({
  repo: 'github.com/org/repo',
  baseBranch: 'main',

  execution: {
    id: 'exec-123',
    patternName: 'code-review',
  },

  task: {
    id: 'task-1',
    role: 'engineer',
    slug: 'implement-auth',
  },

  user: {
    id: 'user-456',
  },
});
```

### What Happens During Provisioning

```mermaid
sequenceDiagram
    participant PE as Pattern Engine
    participant WS as Workspace Service
    participant CRED as Credential Service
    participant GH as GitHub App
    participant FS as File System
    participant GIT as Git

    PE->>WS: provision(config)

    WS->>WS: Generate workspace ID
    WS->>FS: Create workspace directory

    WS->>CRED: getCredentials(repo, write)
    CRED->>GH: Get installation token
    GH-->>CRED: Token (expires in 1h)
    CRED-->>WS: GitCredential

    WS->>WS: Generate branch name

    WS->>GIT: Clone repo (shallow)
    WS->>GIT: Create & checkout branch
    WS->>GIT: Configure identity
    WS->>FS: Write credential helper
    WS->>GIT: Configure credential helper

    WS-->>PE: Workspace ready
```

### Branch Naming Convention

Branches follow a consistent naming pattern:

```
parallax/<execution-id>/<role>/<slug>
```

For example:
```
parallax/exec-abc123/engineer/implement-auth
parallax/exec-abc123/reviewer/security-review
```

This enables:
- Filtering branches by execution
- Identifying which agent created changes
- Cleaning up all branches for an execution

## Credential Management

### Credential Types

| Type | Provider | Use Case |
|------|----------|----------|
| **GitHub App** | GitHub | Production - no user tokens needed |
| **PAT** | Any | User-provided personal access token |
| **OAuth** | Any | User-provided OAuth token |

### Priority Order

When requesting credentials:

```mermaid
flowchart TB
    REQ[Credential Request] --> USER{User Provided?}
    USER -->|Yes| USE_USER[Use User Token]
    USER -->|No| APP{GitHub App?}
    APP -->|Yes| USE_APP[Get Installation Token]
    APP -->|No| ERROR[Error: No Credentials]
```

### User-Provided Credentials

Users can pass their own tokens instead of relying on GitHub App:

```typescript
await patternEngine.executePattern('code-review', input, {
  credentials: {
    type: 'pat',
    token: 'ghp_xxxxxxxxxxxx',
    provider: 'github',
  },
});
```

### Credential Security

Credentials are secured through multiple mechanisms:

1. **Short TTL**: Tokens expire after pattern completion
2. **Isolated Helpers**: Each workspace has its own credential helper script
3. **Secure Cleanup**: Helper scripts are securely deleted after use
4. **Scoped Access**: Tokens only have access to the specific repository

```typescript
// Credential helper script (auto-generated)
#!/bin/bash
# Workspace: ws-abc123
# Execution: exec-def456
# Expires: 2024-01-15T11:30:00.000Z

if [ "$1" = "get" ]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=x-access-token"
  echo "password=<token>"
fi
```

## Finalization

After an agent completes its task, the workspace can be finalized:

```typescript
const pr = await workspaceService.finalize(workspace.id, {
  push: true,
  createPr: true,
  pr: {
    title: 'feat: implement user authentication',
    body: `## Summary\nImplemented OAuth2 authentication flow.\n\n## Changes\n- Added login endpoint\n- Added token validation`,
    targetBranch: 'main',
    draft: false,
    labels: ['enhancement', 'parallax'],
    reviewers: ['tech-lead'],
  },
  cleanup: true,
});

// Returns PR info
console.log(pr.url);    // https://github.com/org/repo/pull/123
console.log(pr.number); // 123
```

### Finalization Flow

```mermaid
sequenceDiagram
    participant PE as Pattern Engine
    participant WS as Workspace Service
    participant GIT as Git
    participant GH as GitHub API
    participant FS as File System

    PE->>WS: finalize(workspaceId, options)

    alt Push Changes
        WS->>GIT: git push -u origin branch
    end

    alt Create PR
        WS->>GH: Create pull request
        GH-->>WS: PR created

        opt Add Labels
            WS->>GH: Add labels
        end

        opt Request Reviewers
            WS->>GH: Request reviewers
        end
    end

    alt Cleanup
        WS->>FS: Delete credential helper
        WS->>WS: Revoke credentials
        WS->>FS: Remove workspace directory
    end

    WS-->>PE: PullRequestInfo
```

## Configuration

### Environment Variables

```bash
# Workspace directory
PARALLAX_WORKSPACES_DIR=./.workspaces

# Auto-cleanup settings
PARALLAX_WORKSPACE_AUTO_CLEANUP=true
PARALLAX_WORKSPACE_TTL_SECONDS=3600

# GitHub App (for automatic credential provisioning)
PARALLAX_GITHUB_APP_ID=123456
PARALLAX_GITHUB_PRIVATE_KEY_PATH=/path/to/key.pem
# Or inline:
PARALLAX_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
```

### Programmatic Configuration

```typescript
const workspaceService = new WorkspaceService(
  {
    workspacesDir: '/var/parallax/workspaces',
    autoCleanup: true,
    workspaceTtlSeconds: 3600,
  },
  credentialService,
  logger
);

await workspaceService.initialize();
```

## Workspace Structure

Each workspace is a complete git repository:

```
.workspaces/
└── ws-abc123/
    ├── .git/
    │   ├── config              # Git config with credential helper
    │   └── ...
    ├── .parallax-credentials   # Credential helper script
    ├── src/                    # Repository contents
    ├── package.json
    └── ...
```

## Querying Workspaces

```typescript
// Get workspace by ID
const workspace = workspaceService.get('ws-abc123');

// Get all workspaces for an execution
const workspaces = workspaceService.getForExecution('exec-def456');
```

### Workspace Object

```typescript
interface Workspace {
  id: string;
  path: string;              // Filesystem path
  repo: string;              // Repository URL
  branch: BranchInfo;        // Branch details
  credential: GitCredential; // Active credential
  provisionedAt: Date;
  status: 'provisioning' | 'ready' | 'finalizing' | 'error' | 'cleaned_up';
}

interface BranchInfo {
  name: string;              // Full branch name
  baseBranch: string;        // e.g., 'main'
  executionId: string;
  role: string;
  pullRequest?: PullRequestInfo;
}
```

## Cleanup

### Manual Cleanup

```typescript
// Clean up single workspace
await workspaceService.cleanup('ws-abc123');

// Clean up all workspaces for an execution
await workspaceService.cleanupForExecution('exec-def456');
```

### Automatic Cleanup

With `autoCleanup: true`, workspaces are cleaned up:

1. After successful finalization with `cleanup: true`
2. When TTL expires
3. On pattern execution failure

### What Gets Cleaned Up

1. **Credential Helper Scripts** - Securely removed
2. **Git Credentials** - Revoked from credential service
3. **Workspace Directory** - Recursively deleted
4. **In-Memory State** - Workspace marked as `cleaned_up`

## Error Handling

### Provisioning Errors

```typescript
try {
  const workspace = await workspaceService.provision(config);
} catch (error) {
  if (error.message.includes('Authentication failed')) {
    // Credential issue - check GitHub App config
  } else if (error.message.includes('Repository not found')) {
    // Invalid repo or no access
  } else if (error.message.includes('Branch not found')) {
    // Base branch doesn't exist
  }
}
```

### Finalization Errors

```typescript
try {
  await workspaceService.finalize(workspaceId, options);
} catch (error) {
  if (error.message.includes('push')) {
    // Push failed - possibly force-push needed
  } else if (error.message.includes('pull request')) {
    // PR creation failed - possibly already exists
  }
}
```

## Best Practices

### 1. Always Finalize or Cleanup

```typescript
try {
  const workspace = await workspaceService.provision(config);
  // ... agent work ...
  await workspaceService.finalize(workspace.id, { cleanup: true });
} catch (error) {
  // Clean up on error too
  await workspaceService.cleanup(workspace.id);
  throw error;
}
```

### 2. Use Short-Lived Credentials

Don't extend credential TTL unnecessarily:

```typescript
// Good - credential expires when no longer needed
const credential = await credentialService.getCredentials({
  ttlSeconds: 300, // 5 minutes for quick task
});

// Avoid - long-lived credentials
const credential = await credentialService.getCredentials({
  ttlSeconds: 86400, // 24 hours is too long
});
```

### 3. Meaningful Branch Names

Use descriptive slugs for branches:

```typescript
// Good
task: { role: 'engineer', slug: 'fix-auth-timeout' }
// Results in: parallax/exec-123/engineer/fix-auth-timeout

// Avoid
task: { role: 'engineer', slug: 'task1' }
// Results in: parallax/exec-123/engineer/task1
```

## Next Steps

- [Agent Lifecycle](./agent-lifecycle) - How agents use workspaces
- [Credential Service](/docs/enterprise/security) - Security details
- [Pattern Execution](/docs/patterns/overview) - Workspace in pattern context
