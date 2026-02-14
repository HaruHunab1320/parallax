/**
 * Git Workspace Service Types
 *
 * Types for git workspace provisioning and credential management.
 */

// ─────────────────────────────────────────────────────────────
// Git Providers
// ─────────────────────────────────────────────────────────────

export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'azure_devops' | 'self_hosted';

export type CredentialType = 'github_app' | 'oauth' | 'deploy_key' | 'pat' | 'ssh_key';

// ─────────────────────────────────────────────────────────────
// Branch Configuration
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for creating a new branch
 */
export interface BranchConfig {
  /**
   * Execution or context ID this branch belongs to
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

/**
 * Information about a created branch
 */
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

/**
 * User-provided credentials passed at execution time.
 * Allows users to supply their own PAT or OAuth token.
 */
export interface UserProvidedCredentials {
  /**
   * Type of credential
   */
  type: 'pat' | 'oauth';

  /**
   * The credential token
   */
  token: string;

  /**
   * Git provider this credential is for (defaults to 'github')
   */
  provider?: GitProvider;
}

/**
 * Context for credential requests (for audit trails)
 */
export interface CredentialContext {
  executionId: string;
  taskId?: string;
  agentId?: string;
  userId?: string;
  reason?: string;
}

/**
 * Request for git credentials
 */
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
  context: CredentialContext;

  /**
   * Requested TTL in seconds (max enforced by policy)
   */
  ttlSeconds?: number;

  /**
   * User-provided credentials (PAT or OAuth token)
   * If provided, these are used instead of managed credentials
   */
  userProvided?: UserProvidedCredentials;
}

/**
 * A git credential grant
 */
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

/**
 * Record of a credential grant for auditing
 */
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

export type WorkspaceStatus =
  | 'provisioning'
  | 'ready'
  | 'in_use'
  | 'finalizing'
  | 'cleaned_up'
  | 'error';

/**
 * Configuration for provisioning a workspace
 */
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

  /**
   * User-provided credentials (PAT or OAuth token)
   * If provided, these are used instead of managed credentials
   */
  userCredentials?: UserProvidedCredentials;
}

/**
 * A provisioned git workspace
 */
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
  status: WorkspaceStatus;
}

/**
 * Options for finalizing a workspace (push, PR creation, cleanup)
 */
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

/**
 * Information about a pull request
 */
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
   * Associated execution ID
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
// Provider Configuration
// ─────────────────────────────────────────────────────────────

/**
 * GitHub App configuration
 */
export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret?: string;
}

/**
 * GitHub App installation info
 */
export interface GitHubAppInstallation {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  repositories: string[];
  permissions: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Service Configuration
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for the workspace service
 */
export interface WorkspaceServiceConfig {
  /**
   * Base directory for workspace storage
   */
  baseDir: string;

  /**
   * Default TTL for credentials in seconds
   */
  defaultCredentialTtl?: number;

  /**
   * Maximum TTL for credentials in seconds
   */
  maxCredentialTtl?: number;

  /**
   * Default branch naming prefix
   */
  branchPrefix?: string;

  /**
   * GitHub App configuration (optional)
   */
  githubApp?: GitHubAppConfig;
}

/**
 * Configuration for the credential service
 */
export interface CredentialServiceConfig {
  /**
   * Default TTL for credentials in seconds
   */
  defaultTtl?: number;

  /**
   * Maximum TTL for credentials in seconds
   */
  maxTtl?: number;

  /**
   * GitHub App configuration
   */
  githubApp?: GitHubAppConfig;
}

// ─────────────────────────────────────────────────────────────
// Provider Interface
// ─────────────────────────────────────────────────────────────

/**
 * Interface for git provider implementations
 */
export interface GitProviderAdapter {
  /**
   * Provider name
   */
  readonly name: GitProvider;

  /**
   * Get credentials for a repository
   */
  getCredentials(request: GitCredentialRequest): Promise<GitCredential>;

  /**
   * Revoke a credential
   */
  revokeCredential(credentialId: string): Promise<void>;

  /**
   * Create a pull request
   */
  createPullRequest(options: {
    repo: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
    draft?: boolean;
    labels?: string[];
    reviewers?: string[];
    credential: GitCredential;
  }): Promise<PullRequestInfo>;

  /**
   * Check if a branch exists
   */
  branchExists(repo: string, branch: string, credential: GitCredential): Promise<boolean>;

  /**
   * Get the default branch for a repository
   */
  getDefaultBranch(repo: string, credential: GitCredential): Promise<string>;
}

// ─────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────

export type WorkspaceEventType =
  | 'workspace:provisioning'
  | 'workspace:ready'
  | 'workspace:error'
  | 'workspace:finalizing'
  | 'workspace:cleaned_up'
  | 'credential:granted'
  | 'credential:revoked'
  | 'pr:created'
  | 'pr:merged';

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  workspaceId?: string;
  credentialId?: string;
  executionId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
  error?: string;
}

export type WorkspaceEventHandler = (event: WorkspaceEvent) => void | Promise<void>;
