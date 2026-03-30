/**
 * Workspace Module
 *
 * Git workspace provisioning and credential management for agent tasks.
 * Types, utilities, and core WorkspaceService are provided by git-workspace-service.
 * Control-plane-specific services (Prisma-backed credentials, GitHub webhooks, providers) are local.
 */

// Re-export types and utilities from git-workspace-service
export type {
  BranchConfig,
  BranchInfo,
  BranchStrategy,
  CredentialGrant,
  CredentialType,
  GitCredential,
  GitCredentialRequest,
  GitHubAppConfig,
  GitHubAppInstallation,
  GitProvider,
  GitProviderAdapter,
  PullRequestInfo,
  UserProvidedCredentials,
  Workspace,
  WorkspaceConfig,
  WorkspaceFinalization,
  WorkspaceServiceConfig,
} from 'git-workspace-service';

export {
  cleanupCredentialFiles,
  configureCredentialHelper,
  createBranchInfo,
  DEFAULT_BRANCH_PREFIX,
  filterBranchesByExecution,
  generateBranchName,
  generateSlug,
  getGitCredentialConfig,
  isManagedBranch,
  parseBranchName,
  WorkspaceService,
} from 'git-workspace-service';
export type { CredentialServiceConfig } from './credential-service';
// Control-plane-specific exports
export { CredentialService } from './credential-service';
export { createGitHubWebhookRouter } from './github-webhooks';
export * from './providers';
export { createWorkspaceRouter } from './workspace-api';
