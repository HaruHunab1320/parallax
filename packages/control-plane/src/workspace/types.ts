/**
 * Workspace Service Types
 *
 * Types for git workspace provisioning and credential management.
 */

// ─────────────────────────────────────────────────────────────
// Branch Naming
// ─────────────────────────────────────────────────────────────

export interface BranchConfig {
  /**
   * Execution ID this branch belongs to
   */
  executionId: string;

  /**
   * Role or task identifier
   */
  role: string;

  /**
   * Optional slug for human readability
   */
  slug?: string;

  /**
   * Base branch to create from
   */
  baseBranch: string;
}

export interface BranchInfo {
  /**
   * Full branch name (e.g., "parallax/exec-abc123/engineer-auth")
   */
  name: string;

  /**
   * Execution this branch belongs to
   */
  executionId: string;

  /**
   * Base branch it was created from
   */
  baseBranch: string;

  /**
   * When the branch was created
   */
  createdAt: Date;

  /**
   * Associated PR if one exists
   */
  pullRequest?: PullRequestInfo;
}

// ─────────────────────────────────────────────────────────────
// Git Credentials
// ─────────────────────────────────────────────────────────────

export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'azure_devops' | 'self_hosted';

export type CredentialType = 'github_app' | 'oauth' | 'deploy_key' | 'pat' | 'ssh_key';

export interface GitCredentialRequest {
  /**
   * Repository URL or identifier
   */
  repo: string;

  /**
   * Required access level
   */
  access: 'read' | 'write';

  /**
   * Context for audit trail
   */
  context: {
    executionId: string;
    taskId?: string;
    agentId?: string;
    userId?: string;
    reason?: string;
  };

  /**
   * Requested TTL in seconds (max enforced by policy)
   */
  ttlSeconds?: number;
}

export interface GitCredential {
  /**
   * Unique ID for this credential grant
   */
  id: string;

  /**
   * How to authenticate
   */
  type: CredentialType;

  /**
   * The credential value (token, key, etc.)
   */
  token: string;

  /**
   * Repository this credential is scoped to
   */
  repo: string;

  /**
   * Permissions granted
   */
  permissions: string[];

  /**
   * When this credential expires
   */
  expiresAt: Date;

  /**
   * Git provider
   */
  provider: GitProvider;
}

export interface CredentialGrant {
  id: string;
  type: CredentialType;
  repo: string;
  provider: GitProvider;
  grantedTo: {
    executionId: string;
    taskId?: string;
    agentId?: string;
  };
  permissions: string[];
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
}

// ─────────────────────────────────────────────────────────────
// Workspace
// ─────────────────────────────────────────────────────────────

export type BranchStrategy = 'feature_branch' | 'fork' | 'direct';

export interface WorkspaceConfig {
  /**
   * Repository to clone
   */
  repo: string;

  /**
   * Git provider
   */
  provider?: GitProvider;

  /**
   * Branch strategy
   */
  branchStrategy: BranchStrategy;

  /**
   * Base branch to create feature branches from
   */
  baseBranch: string;

  /**
   * Execution context
   */
  execution: {
    id: string;
    patternName: string;
  };

  /**
   * Task/role requesting the workspace
   */
  task: {
    id: string;
    role: string;
    slug?: string;
  };

  /**
   * User context for credential resolution
   */
  user?: {
    id: string;
    oauthToken?: string;
  };
}

export interface Workspace {
  /**
   * Unique workspace ID
   */
  id: string;

  /**
   * Local filesystem path
   */
  path: string;

  /**
   * Repository URL
   */
  repo: string;

  /**
   * Branch created for this workspace
   */
  branch: BranchInfo;

  /**
   * Credential for this workspace
   */
  credential: GitCredential;

  /**
   * When the workspace was provisioned
   */
  provisionedAt: Date;

  /**
   * Current status
   */
  status: 'provisioning' | 'ready' | 'in_use' | 'finalizing' | 'cleaned_up' | 'error';
}

export interface WorkspaceFinalization {
  /**
   * Whether to push the branch
   */
  push: boolean;

  /**
   * Whether to create a PR
   */
  createPr: boolean;

  /**
   * PR configuration
   */
  pr?: {
    title: string;
    body: string;
    targetBranch: string;
    draft?: boolean;
    labels?: string[];
    reviewers?: string[];
  };

  /**
   * Whether to clean up the workspace after finalization
   */
  cleanup: boolean;
}

// ─────────────────────────────────────────────────────────────
// Pull Requests
// ─────────────────────────────────────────────────────────────

export interface PullRequestInfo {
  /**
   * PR number
   */
  number: number;

  /**
   * PR URL
   */
  url: string;

  /**
   * PR state
   */
  state: 'open' | 'closed' | 'merged';

  /**
   * Source branch
   */
  sourceBranch: string;

  /**
   * Target branch
   */
  targetBranch: string;

  /**
   * Title
   */
  title: string;

  /**
   * Associated execution
   */
  executionId: string;

  /**
   * Created timestamp
   */
  createdAt: Date;

  /**
   * Merged timestamp if merged
   */
  mergedAt?: Date;
}

// ─────────────────────────────────────────────────────────────
// GitHub App
// ─────────────────────────────────────────────────────────────

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret?: string;
}

export interface GitHubAppInstallation {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  repositories: string[];
  permissions: Record<string, string>;
}
