/**
 * Branch Naming Service
 *
 * Generates and parses Parallax-managed branch names.
 * Format: parallax/{execution-id}/{role}-{slug}
 */

import { BranchConfig, BranchInfo } from './types';

export const BRANCH_PREFIX = 'parallax';

export interface BranchNamingOptions {
  /**
   * Maximum length for the slug portion
   */
  maxSlugLength?: number;

  /**
   * Custom prefix (defaults to 'parallax')
   */
  prefix?: string;
}

const DEFAULT_OPTIONS: Required<BranchNamingOptions> = {
  maxSlugLength: 30,
  prefix: BRANCH_PREFIX,
};

/**
 * Generate a branch name from configuration
 */
export function generateBranchName(
  config: BranchConfig,
  options?: BranchNamingOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Sanitize role
  const role = sanitizeForBranch(config.role);

  // Generate slug from description or use provided
  const slug = config.slug
    ? sanitizeForBranch(config.slug, opts.maxSlugLength)
    : '';

  // Build branch name
  const parts = [opts.prefix, config.executionId, role];
  if (slug) {
    parts[2] = `${role}-${slug}`;
  }

  return parts.join('/');
}

/**
 * Parse a branch name into its components
 */
export function parseBranchName(
  branchName: string,
  options?: BranchNamingOptions
): { executionId: string; role: string; slug?: string } | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check if it's a Parallax branch
  if (!branchName.startsWith(`${opts.prefix}/`)) {
    return null;
  }

  const parts = branchName.split('/');
  if (parts.length < 3) {
    return null;
  }

  const [, executionId, roleAndSlug] = parts;

  // Parse role and optional slug
  const dashIndex = roleAndSlug.indexOf('-');
  if (dashIndex === -1) {
    return { executionId, role: roleAndSlug };
  }

  return {
    executionId,
    role: roleAndSlug.substring(0, dashIndex),
    slug: roleAndSlug.substring(dashIndex + 1),
  };
}

/**
 * Check if a branch name is a Parallax-managed branch
 */
export function isParallaxBranch(
  branchName: string,
  options?: BranchNamingOptions
): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return branchName.startsWith(`${opts.prefix}/`);
}

/**
 * Get all branches for a specific execution
 */
export function filterBranchesByExecution(
  branches: string[],
  executionId: string,
  options?: BranchNamingOptions
): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const prefix = `${opts.prefix}/${executionId}/`;
  return branches.filter((b) => b.startsWith(prefix));
}

/**
 * Generate branch info object
 */
export function createBranchInfo(
  config: BranchConfig,
  options?: BranchNamingOptions
): BranchInfo {
  return {
    name: generateBranchName(config, options),
    executionId: config.executionId,
    baseBranch: config.baseBranch,
    createdAt: new Date(),
  };
}

/**
 * Sanitize a string for use in a branch name
 */
function sanitizeForBranch(input: string, maxLength?: number): string {
  let result = input
    .toLowerCase()
    // Replace spaces and underscores with dashes
    .replace(/[\s_]+/g, '-')
    // Remove invalid characters
    .replace(/[^a-z0-9-]/g, '')
    // Remove consecutive dashes
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-|-$/g, '');

  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength).replace(/-$/, '');
  }

  return result;
}

/**
 * Generate a slug from a task description
 */
export function generateSlug(description: string, maxLength = 30): string {
  // Extract key words
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter((w) => !STOP_WORDS.has(w))
    .slice(0, 4);

  return sanitizeForBranch(words.join('-'), maxLength);
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'have',
  'has',
  'will',
  'would',
  'could',
  'should',
  'been',
  'being',
  'into',
  'than',
  'then',
  'when',
  'where',
  'which',
  'while',
  'about',
  'after',
  'before',
]);
