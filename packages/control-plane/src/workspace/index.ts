/**
 * Workspace Module
 *
 * Git workspace provisioning and credential management for agent tasks.
 * Types, utilities, and core WorkspaceService are provided by git-workspace-service.
 * Control-plane-specific services (Prisma-backed credentials, GitHub webhooks, providers) are local.
 */

// Re-export types and utilities from git-workspace-service
export type {
  Workspace,
  WorkspaceConfig,
  WorkspaceFinalization,
  WorkspaceServiceConfig,
  BranchConfig,
  BranchInfo,
  BranchStrategy,
  PullRequestInfo,
  GitProvider,
  CredentialType,
  GitCredential,
  GitCredentialRequest,
  CredentialGrant,
  UserProvidedCredentials,
  GitHubAppConfig,
  GitHubAppInstallation,
  GitProviderAdapter,
} from 'git-workspace-service';

export {
  WorkspaceService,
  generateBranchName,
  parseBranchName,
  isManagedBranch,
  filterBranchesByExecution,
  createBranchInfo,
  generateSlug,
  DEFAULT_BRANCH_PREFIX,
  configureCredentialHelper,
  cleanupCredentialFiles,
  getGitCredentialConfig,
} from 'git-workspace-service';

// Control-plane-specific exports
export { CredentialService } from './credential-service';
export type { CredentialServiceConfig } from './credential-service';
export { createWorkspaceRouter } from './workspace-api';
export { createGitHubWebhookRouter } from './github-webhooks';
export * from './providers';
