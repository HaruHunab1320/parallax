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
 * Token-based credentials (PAT or OAuth)
 */
export interface TokenCredentials {
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
 * SSH-based credentials using system SSH agent
 */
export interface SshCredentials {
  /**
   * Type of credential
   */
  type: 'ssh';

  /**
   * Git provider this credential is for (defaults to 'github')
   */
  provider?: GitProvider;
}

/**
 * User-provided credentials passed at execution time.
 * Allows users to supply their own PAT, OAuth token, or use system SSH.
 */
export type UserProvidedCredentials = TokenCredentials | SshCredentials;

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

/**
 * Workspace provisioning strategy
 * - 'clone': Full clone of the repository (default)
 * - 'worktree': Git worktree from an existing clone (faster, shared .git)
 */
export type WorkspaceStrategy = 'clone' | 'worktree';

export type WorkspaceStatus =
  | 'provisioning'
  | 'ready'
  | 'in_use'
  | 'finalizing'
  | 'cleaned_up'
  | 'error';

/**
 * Granular progress phases for workspace operations
 */
export type WorkspacePhase =
  | 'initializing'
  | 'cloning'
  | 'creating_branch'
  | 'configuring'
  | 'ready'
  | 'committing'
  | 'pushing'
  | 'creating_pr'
  | 'cleaning_up'
  | 'done'
  | 'error';

/**
 * Progress tracking for workspace operations
 */
export interface WorkspaceProgress {
  /**
   * Current phase of the operation
   */
  phase: WorkspacePhase;

  /**
   * Human-readable message describing current activity
   */
  message?: string;

  /**
   * Progress percentage (0-100) if determinable
   */
  percent?: number;

  /**
   * When progress was last updated
   */
  updatedAt: Date;
}

/**
 * Completion hook configuration
 */
export interface CompletionHook {
  /**
   * Shell command to execute on completion
   * Variables available: $WORKSPACE_ID, $REPO, $BRANCH, $STATUS
   */
  command?: string;

  /**
   * Webhook URL to POST to on completion
   */
  webhook?: string;

  /**
   * Custom headers for webhook request
   */
  webhookHeaders?: Record<string, string>;

  /**
   * Whether to run hook on error (default: true)
   */
  runOnError?: boolean;
}

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
   * Workspace strategy: 'clone' (default) or 'worktree'
   * Worktrees are faster and use less disk space for parallel work on same repo
   */
  strategy?: WorkspaceStrategy;

  /**
   * Parent workspace ID (required when strategy is 'worktree')
   * The parent must be a 'clone' workspace for the same repo
   */
  parentWorkspace?: string;

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

  /**
   * Hook to run when workspace operations complete
   */
  onComplete?: CompletionHook;
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
   * Credential for this workspace.
   * Optional for public repositories (read-only operations).
   * Required for write operations (push, PR creation).
   */
  credential?: GitCredential;

  /**
   * When the workspace was provisioned
   */
  provisionedAt: Date;

  /**
   * Current status
   */
  status: WorkspaceStatus;

  /**
   * Workspace strategy used ('clone' or 'worktree')
   */
  strategy: WorkspaceStrategy;

  /**
   * Parent workspace ID (for worktrees)
   */
  parentWorkspaceId?: string;

  /**
   * Child worktree IDs (for clone workspaces that have worktrees)
   */
  worktreeIds?: string[];

  /**
   * Current progress of workspace operations
   */
  progress?: WorkspaceProgress;

  /**
   * Completion hook configuration
   */
  onComplete?: CompletionHook;
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
// Issues
// ─────────────────────────────────────────────────────────────

/**
 * Issue state
 */
export type IssueState = 'open' | 'closed';

/**
 * Information about an issue
 */
export interface IssueInfo {
  /**
   * Issue number
   */
  number: number;

  /**
   * Issue URL
   */
  url: string;

  /**
   * Issue state
   */
  state: IssueState;

  /**
   * Issue title
   */
  title: string;

  /**
   * Issue body/description
   */
  body: string;

  /**
   * Labels on the issue
   */
  labels: string[];

  /**
   * Assignees
   */
  assignees: string[];

  /**
   * Created timestamp
   */
  createdAt: Date;

  /**
   * Closed timestamp if closed
   */
  closedAt?: Date;

  /**
   * Associated execution ID (if managed)
   */
  executionId?: string;
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  /**
   * Issue title
   */
  title: string;

  /**
   * Issue body/description
   */
  body: string;

  /**
   * Labels to add
   */
  labels?: string[];

  /**
   * Assignees (usernames)
   */
  assignees?: string[];

  /**
   * Milestone number
   */
  milestone?: number;
}

/**
 * Options for commenting on an issue
 */
export interface IssueCommentOptions {
  /**
   * Comment body
   */
  body: string;
}

/**
 * Information about an issue comment
 */
export interface IssueComment {
  /**
   * Comment ID
   */
  id: number;

  /**
   * Comment URL
   */
  url: string;

  /**
   * Comment body
   */
  body: string;

  /**
   * Author username
   */
  author: string;

  /**
   * Created timestamp
   */
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Agent Permissions & OAuth
// ─────────────────────────────────────────────────────────────

/**
 * Permission level for a resource
 */
export type PermissionLevel = 'none' | 'read' | 'write';

/**
 * Repository access scope
 */
export type RepositoryScope =
  | { type: 'all' }                    // All repositories user has access to
  | { type: 'public' }                 // Only public repositories
  | { type: 'selected'; repos: string[] }; // Specific repos (owner/repo format)

/**
 * Permissions that an agent can request/receive.
 * Designed to be restrictive by default - dangerous operations require explicit opt-in.
 */
export interface AgentPermissions {
  /**
   * Which repositories the agent can access
   */
  repositories: RepositoryScope;

  /**
   * Permission for repository contents (code, files)
   */
  contents: PermissionLevel;

  /**
   * Permission for pull requests
   */
  pullRequests: PermissionLevel;

  /**
   * Permission for issues
   */
  issues: PermissionLevel;

  /**
   * Permission for metadata (repo info, branches, tags)
   */
  metadata: PermissionLevel;

  // ─────────────────────────────────────────────────────────────
  // Dangerous Operations - Explicit opt-in, default false
  // ─────────────────────────────────────────────────────────────

  /**
   * Can delete branches (for cleanup after merge)
   * @default false
   */
  canDeleteBranch?: boolean;

  /**
   * Can force push to branches
   * @default false - Almost never needed, can destroy history
   */
  canForcePush?: boolean;

  /**
   * Can delete repositories
   * @default false - Should NEVER be true for agents
   */
  canDeleteRepository?: boolean;

  /**
   * Can modify repository settings/webhooks
   * @default false
   */
  canAdminister?: boolean;
}

/**
 * Default safe permissions for agents
 */
export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  repositories: { type: 'selected', repos: [] },
  contents: 'write',
  pullRequests: 'write',
  issues: 'write',
  metadata: 'read',
  canDeleteBranch: true,  // Needed for cleanup
  canForcePush: false,
  canDeleteRepository: false,
  canAdminister: false,
};

/**
 * Read-only permissions for agents that only need to inspect
 */
export const READONLY_AGENT_PERMISSIONS: AgentPermissions = {
  repositories: { type: 'selected', repos: [] },
  contents: 'read',
  pullRequests: 'read',
  issues: 'read',
  metadata: 'read',
  canDeleteBranch: false,
  canForcePush: false,
  canDeleteRepository: false,
  canAdminister: false,
};

/**
 * OAuth token with metadata
 */
export interface OAuthToken {
  /**
   * Access token for API calls
   */
  accessToken: string;

  /**
   * Token type (usually "bearer")
   */
  tokenType: string;

  /**
   * Scopes granted by the token
   */
  scopes: string[];

  /**
   * When the token expires
   */
  expiresAt?: Date;

  /**
   * Refresh token for obtaining new access tokens
   */
  refreshToken?: string;

  /**
   * Provider this token is for
   */
  provider: GitProvider;

  /**
   * Permissions associated with this token
   */
  permissions: AgentPermissions;

  /**
   * When the token was created
   */
  createdAt: Date;
}

/**
 * Device code response from OAuth provider
 */
export interface DeviceCodeResponse {
  /**
   * Code to poll for authorization
   */
  deviceCode: string;

  /**
   * Code for user to enter
   */
  userCode: string;

  /**
   * URL for user to visit
   */
  verificationUri: string;

  /**
   * Full URL with code pre-filled (if supported)
   */
  verificationUriComplete?: string;

  /**
   * Seconds until codes expire
   */
  expiresIn: number;

  /**
   * Seconds between poll requests
   */
  interval: number;
}

/**
 * Auth prompt for user interaction
 */
export interface AuthPrompt {
  /**
   * Provider requiring auth
   */
  provider: GitProvider;

  /**
   * URL to visit
   */
  verificationUri: string;

  /**
   * Code to enter
   */
  userCode: string;

  /**
   * Seconds until code expires
   */
  expiresIn: number;

  /**
   * Permissions being requested
   */
  requestedPermissions: AgentPermissions;
}

/**
 * Result of auth flow
 */
export interface AuthResult {
  /**
   * Whether auth succeeded
   */
  success: boolean;

  /**
   * Provider that was authenticated
   */
  provider: GitProvider;

  /**
   * Username/identity if successful
   */
  username?: string;

  /**
   * Error message if failed
   */
  error?: string;
}

/**
 * Callback interface for auth prompts
 */
export interface AuthPromptEmitter {
  /**
   * Called when user action is required for authentication
   */
  onAuthRequired(prompt: AuthPrompt): void;

  /**
   * Called when authentication completes (success or failure)
   */
  onAuthComplete(result: AuthResult): void;

  /**
   * Called periodically while waiting for auth (optional)
   */
  onAuthPending?(secondsRemaining: number): void;
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
  | 'worktree:added'
  | 'worktree:removed'
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
