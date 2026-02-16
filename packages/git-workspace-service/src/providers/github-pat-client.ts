/**
 * GitHub PAT Client
 *
 * Simple GitHub API client using a Personal Access Token.
 * Useful for testing and simple integrations without GitHub App setup.
 */

import type {
  PullRequestInfo,
  IssueInfo,
  CreateIssueOptions,
  IssueComment,
  IssueCommentOptions,
  IssueState,
} from '../types';

// Lazy-loaded Octokit
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let OctokitClass: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadOctokit(): any {
  if (!OctokitClass) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Octokit } = require('@octokit/rest');
      OctokitClass = Octokit;
    } catch {
      throw new Error(
        '@octokit/rest is required for GitHubPatClient. ' +
          'Install it with: npm install @octokit/rest'
      );
    }
  }
  return OctokitClass;
}

export interface GitHubPatClientOptions {
  /**
   * Personal Access Token
   */
  token: string;

  /**
   * GitHub API base URL (for GitHub Enterprise)
   */
  baseUrl?: string;
}

export interface GitHubPatClientLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

/**
 * Simple GitHub client using a Personal Access Token.
 * Provides PR and Issue management without GitHub App complexity.
 */
export class GitHubPatClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private octokit: any;
  private readonly logger?: GitHubPatClientLogger;

  constructor(options: GitHubPatClientOptions, logger?: GitHubPatClientLogger) {
    this.logger = logger;
    const Octokit = loadOctokit();
    this.octokit = new Octokit({
      auth: options.token,
      baseUrl: options.baseUrl,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Pull Requests
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    options: {
      title: string;
      body: string;
      head: string;
      base: string;
      draft?: boolean;
      labels?: string[];
      reviewers?: string[];
    }
  ): Promise<PullRequestInfo> {
    const { data: pr } = await this.octokit.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft,
    });

    // Add labels if specified
    if (options.labels && options.labels.length > 0) {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: options.labels,
      });
    }

    // Request reviewers if specified
    if (options.reviewers && options.reviewers.length > 0) {
      await this.octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pr.number,
        reviewers: options.reviewers,
      });
    }

    this.log('info', { owner, repo, prNumber: pr.number }, 'Pull request created');

    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.state as 'open' | 'closed' | 'merged',
      sourceBranch: options.head,
      targetBranch: options.base,
      title: options.title,
      executionId: '',
      createdAt: new Date(pr.created_at),
    };
  }

  /**
   * Get a pull request
   */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestInfo> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.merged ? 'merged' : (pr.state as 'open' | 'closed'),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      title: pr.title,
      executionId: '',
      createdAt: new Date(pr.created_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Issues
  // ─────────────────────────────────────────────────────────────

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    options: CreateIssueOptions
  ): Promise<IssueInfo> {
    const { data: issue } = await this.octokit.issues.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      labels: options.labels,
      assignees: options.assignees,
      milestone: options.milestone,
    });

    this.log('info', { owner, repo, issueNumber: issue.number }, 'Issue created');

    return this.mapIssue(issue);
  }

  /**
   * Get an issue
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<IssueInfo> {
    const { data: issue } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return this.mapIssue(issue);
  }

  /**
   * List issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: IssueState | 'all';
      labels?: string[];
      assignee?: string;
    }
  ): Promise<IssueInfo[]> {
    const { data: issues } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: options?.state || 'open',
      labels: options?.labels?.join(','),
      assignee: options?.assignee,
      per_page: 100,
    });

    // Filter out pull requests
    return issues
      .filter((issue: { pull_request?: unknown }) => !issue.pull_request)
      .map((issue: Record<string, unknown>) => this.mapIssue(issue));
  }

  /**
   * Update an issue
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    options: {
      title?: string;
      body?: string;
      state?: IssueState;
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<IssueInfo> {
    const { data: issue } = await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      ...options,
    });

    this.log('info', { owner, repo, issueNumber }, 'Issue updated');

    return this.mapIssue(issue);
  }

  /**
   * Add labels to an issue
   */
  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<void> {
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });

    this.log('info', { owner, repo, issueNumber, labels }, 'Labels added');
  }

  /**
   * Remove a label from an issue
   */
  async removeLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: string
  ): Promise<void> {
    await this.octokit.issues.removeLabel({
      owner,
      repo,
      issue_number: issueNumber,
      name: label,
    });

    this.log('info', { owner, repo, issueNumber, label }, 'Label removed');
  }

  /**
   * Add a comment to an issue or PR
   */
  async addComment(
    owner: string,
    repo: string,
    issueNumber: number,
    options: IssueCommentOptions
  ): Promise<IssueComment> {
    const { data: comment } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: options.body,
    });

    this.log('info', { owner, repo, issueNumber, commentId: comment.id }, 'Comment added');

    return {
      id: comment.id,
      url: comment.html_url,
      body: comment.body || '',
      author: comment.user?.login || 'unknown',
      createdAt: new Date(comment.created_at),
    };
  }

  /**
   * List comments on an issue or PR
   */
  async listComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueComment[]> {
    const { data: comments } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    return comments.map((comment: {
      id: number;
      html_url: string;
      body?: string;
      user?: { login: string };
      created_at: string;
    }) => ({
      id: comment.id,
      url: comment.html_url,
      body: comment.body || '',
      author: comment.user?.login || 'unknown',
      createdAt: new Date(comment.created_at),
    }));
  }

  /**
   * Close an issue
   */
  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<IssueInfo> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'closed' });
  }

  /**
   * Reopen an issue
   */
  async reopenIssue(owner: string, repo: string, issueNumber: number): Promise<IssueInfo> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'open' });
  }

  // ─────────────────────────────────────────────────────────────
  // Branches
  // ─────────────────────────────────────────────────────────────

  /**
   * Delete a branch
   */
  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    await this.octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    this.log('info', { owner, repo, branch }, 'Branch deleted');
  }

  /**
   * Check if a branch exists
   */
  async branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
    try {
      await this.octokit.repos.getBranch({ owner, repo, branch });
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapIssue(issue: any): IssueInfo {
    return {
      number: issue.number,
      url: issue.html_url,
      state: issue.state as IssueState,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l: { name?: string } | string) =>
        typeof l === 'string' ? l : l.name || ''
      ),
      assignees: issue.assignees?.map((a: { login: string }) => a.login) || [],
      createdAt: new Date(issue.created_at),
      closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
    };
  }

  private log(
    level: 'info' | 'warn' | 'error',
    data: Record<string, unknown>,
    message: string
  ): void {
    if (this.logger) {
      this.logger[level](data, message);
    }
  }
}
