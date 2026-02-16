/**
 * @parallax/git-workspace-service
 *
 * Git workspace provisioning and credential management service.
 */

// Main services
export { WorkspaceService } from './workspace-service';
export type { WorkspaceServiceOptions, WorkspaceServiceLogger } from './workspace-service';

export { CredentialService } from './credential-service';
export type {
  CredentialServiceOptions,
  CredentialServiceLogger,
  CredentialGrantStore,
} from './credential-service';

// Providers
export { GitHubProvider } from './providers/github-provider';
export type { GitHubProviderConfig, GitHubProviderLogger } from './providers/github-provider';

export { GitHubPatClient } from './providers/github-pat-client';
export type { GitHubPatClientOptions, GitHubPatClientLogger } from './providers/github-pat-client';

// OAuth
export { OAuthDeviceFlow, TokenStore, FileTokenStore, MemoryTokenStore } from './oauth';
export type { OAuthDeviceFlowConfig, OAuthDeviceFlowLogger, TokenStoreOptions } from './oauth';

// Utilities
export {
  generateBranchName,
  parseBranchName,
  isManagedBranch,
  filterBranchesByExecution,
  createBranchInfo,
  generateSlug,
  DEFAULT_BRANCH_PREFIX,
} from './utils/branch-naming';
export type { BranchNamingOptions } from './utils/branch-naming';

export {
  configureCredentialHelper,
  cleanupCredentialFiles,
  updateCredentials,
  getGitCredentialConfig,
  createNodeCredentialHelperScript,
  createShellCredentialHelperScript,
  outputCredentials,
} from './utils/git-credential-helper';
export type { CredentialHelperContext } from './utils/git-credential-helper';

// Permission defaults
export {
  DEFAULT_AGENT_PERMISSIONS,
  READONLY_AGENT_PERMISSIONS,
} from './types';

// Types
export type {
  // Git providers
  GitProvider,
  CredentialType,
  GitProviderAdapter,
  TokenCredentials,
  SshCredentials,

  // Branch
  BranchConfig,
  BranchInfo,
  BranchStrategy,

  // Credentials
  UserProvidedCredentials,
  CredentialContext,
  GitCredentialRequest,
  GitCredential,
  CredentialGrant,

  // Workspace
  WorkspaceStatus,
  WorkspaceConfig,
  Workspace,
  WorkspaceFinalization,
  WorkspaceServiceConfig,

  // Pull requests
  PullRequestInfo,

  // Issues
  IssueState,
  IssueInfo,
  CreateIssueOptions,
  IssueComment,
  IssueCommentOptions,

  // Permissions & OAuth
  PermissionLevel,
  RepositoryScope,
  AgentPermissions,
  OAuthToken,
  DeviceCodeResponse,
  AuthPrompt,
  AuthResult,
  AuthPromptEmitter,

  // GitHub App
  GitHubAppConfig,
  GitHubAppInstallation,

  // Credential service config
  CredentialServiceConfig,

  // Events
  WorkspaceEventType,
  WorkspaceEvent,
  WorkspaceEventHandler,
} from './types';
