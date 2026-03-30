/**
 * @parallaxai/git-workspace-service
 *
 * Git workspace provisioning and credential management service.
 */

export type {
  CredentialGrantStore,
  CredentialServiceLogger,
  CredentialServiceOptions,
} from './credential-service';
export { CredentialService } from './credential-service';
export type {
  OAuthDeviceFlowConfig,
  OAuthDeviceFlowLogger,
  TokenStoreOptions,
} from './oauth';
// OAuth
export {
  FileTokenStore,
  MemoryTokenStore,
  OAuthDeviceFlow,
  TokenStore,
} from './oauth';
export type {
  GitHubPatClientLogger,
  GitHubPatClientOptions,
} from './providers/github-pat-client';
export { GitHubPatClient } from './providers/github-pat-client';
export type {
  GitHubProviderConfig,
  GitHubProviderLogger,
} from './providers/github-provider';
// Providers
export { GitHubProvider } from './providers/github-provider';
// Types
export type {
  AgentPermissions,
  AuthPrompt,
  AuthPromptEmitter,
  AuthResult,
  // Branch
  BranchConfig,
  BranchInfo,
  BranchStrategy,
  CompletionHook,
  CreateIssueOptions,
  CredentialContext,
  CredentialGrant,
  // Credential service config
  CredentialServiceConfig,
  CredentialType,
  DeviceCodeResponse,
  GitCredential,
  GitCredentialRequest,
  // GitHub App
  GitHubAppConfig,
  GitHubAppInstallation,
  // Git providers
  GitProvider,
  GitProviderAdapter,
  IssueComment,
  IssueCommentOptions,
  IssueInfo,
  // Issues
  IssueState,
  OAuthToken,
  // Permissions & OAuth
  PermissionLevel,
  // Pull requests
  PullRequestInfo,
  RepositoryScope,
  SshCredentials,
  TokenCredentials,
  // Credentials
  UserProvidedCredentials,
  Workspace,
  WorkspaceConfig,
  WorkspaceEvent,
  WorkspaceEventHandler,
  // Events
  WorkspaceEventType,
  WorkspaceFinalization,
  WorkspacePhase,
  WorkspaceProgress,
  WorkspaceServiceConfig,
  // Workspace
  WorkspaceStatus,
  // Workspace strategy & progress
  WorkspaceStrategy,
} from './types';
// Permission defaults
export {
  DEFAULT_AGENT_PERMISSIONS,
  READONLY_AGENT_PERMISSIONS,
} from './types';
export type { BranchNamingOptions } from './utils/branch-naming';
// Utilities
export {
  createBranchInfo,
  DEFAULT_BRANCH_PREFIX,
  filterBranchesByExecution,
  generateBranchName,
  generateSlug,
  isManagedBranch,
  parseBranchName,
} from './utils/branch-naming';
export type { CredentialHelperContext } from './utils/git-credential-helper';
export {
  cleanupCredentialFiles,
  configureCredentialHelper,
  createNodeCredentialHelperScript,
  createShellCredentialHelperScript,
  getGitCredentialConfig,
  outputCredentials,
  updateCredentials,
} from './utils/git-credential-helper';
export type {
  WorkspaceServiceLogger,
  WorkspaceServiceOptions,
} from './workspace-service';
// Main services
export { WorkspaceService } from './workspace-service';
