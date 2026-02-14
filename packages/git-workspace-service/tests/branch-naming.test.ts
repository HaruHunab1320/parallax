/**
 * Branch Naming Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateBranchName,
  parseBranchName,
  isManagedBranch,
  filterBranchesByExecution,
  createBranchInfo,
  generateSlug,
  DEFAULT_BRANCH_PREFIX,
} from '../src/utils/branch-naming';

describe('generateBranchName', () => {
  it('generates branch name with prefix, execution ID, and role', () => {
    const result = generateBranchName({
      executionId: 'exec-123',
      role: 'engineer',
      baseBranch: 'main',
    });

    expect(result).toBe('parallax/exec-123/engineer');
  });

  it('includes slug when provided', () => {
    const result = generateBranchName({
      executionId: 'exec-123',
      role: 'engineer',
      slug: 'auth-feature',
      baseBranch: 'main',
    });

    expect(result).toBe('parallax/exec-123/engineer-auth-feature');
  });

  it('sanitizes role with special characters', () => {
    const result = generateBranchName({
      executionId: 'exec-123',
      role: 'Senior Engineer!',
      baseBranch: 'main',
    });

    expect(result).toBe('parallax/exec-123/senior-engineer');
  });

  it('uses custom prefix', () => {
    const result = generateBranchName(
      {
        executionId: 'exec-123',
        role: 'engineer',
        baseBranch: 'main',
      },
      { prefix: 'custom' }
    );

    expect(result).toBe('custom/exec-123/engineer');
  });

  it('truncates long slugs', () => {
    const result = generateBranchName(
      {
        executionId: 'exec-123',
        role: 'engineer',
        slug: 'this-is-a-very-long-slug-that-should-be-truncated',
        baseBranch: 'main',
      },
      { maxSlugLength: 20 }
    );

    expect(result).toBe('parallax/exec-123/engineer-this-is-a-very-long');
  });
});

describe('parseBranchName', () => {
  it('parses valid branch name', () => {
    const result = parseBranchName('parallax/exec-123/engineer');

    expect(result).toEqual({
      executionId: 'exec-123',
      role: 'engineer',
    });
  });

  it('parses branch name with slug', () => {
    const result = parseBranchName('parallax/exec-123/engineer-auth-feature');

    expect(result).toEqual({
      executionId: 'exec-123',
      role: 'engineer',
      slug: 'auth-feature',
    });
  });

  it('returns null for non-managed branch', () => {
    const result = parseBranchName('feature/my-feature');

    expect(result).toBeNull();
  });

  it('returns null for invalid format', () => {
    const result = parseBranchName('parallax/exec-123');

    expect(result).toBeNull();
  });

  it('parses with custom prefix', () => {
    const result = parseBranchName('custom/exec-123/engineer', { prefix: 'custom' });

    expect(result).toEqual({
      executionId: 'exec-123',
      role: 'engineer',
    });
  });
});

describe('isManagedBranch', () => {
  it('returns true for managed branch', () => {
    expect(isManagedBranch('parallax/exec-123/engineer')).toBe(true);
  });

  it('returns false for non-managed branch', () => {
    expect(isManagedBranch('feature/my-feature')).toBe(false);
  });

  it('uses custom prefix', () => {
    expect(isManagedBranch('custom/exec-123/engineer', { prefix: 'custom' })).toBe(true);
  });
});

describe('filterBranchesByExecution', () => {
  it('filters branches for specific execution', () => {
    const branches = [
      'parallax/exec-123/engineer',
      'parallax/exec-123/reviewer',
      'parallax/exec-456/engineer',
      'feature/unrelated',
    ];

    const result = filterBranchesByExecution(branches, 'exec-123');

    expect(result).toEqual([
      'parallax/exec-123/engineer',
      'parallax/exec-123/reviewer',
    ]);
  });

  it('returns empty array when no matches', () => {
    const branches = ['feature/unrelated', 'main'];

    const result = filterBranchesByExecution(branches, 'exec-123');

    expect(result).toEqual([]);
  });
});

describe('createBranchInfo', () => {
  it('creates branch info object', () => {
    const result = createBranchInfo({
      executionId: 'exec-123',
      role: 'engineer',
      baseBranch: 'main',
    });

    expect(result.name).toBe('parallax/exec-123/engineer');
    expect(result.executionId).toBe('exec-123');
    expect(result.baseBranch).toBe('main');
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});

describe('generateSlug', () => {
  it('generates slug from description', () => {
    const result = generateSlug('Implement user authentication');

    expect(result).toBe('implement-user-authentication');
  });

  it('removes stop words', () => {
    const result = generateSlug('Add the feature for the user');

    expect(result).toBe('add-feature-user');
  });

  it('limits to max length', () => {
    const result = generateSlug('This is a very long description that should be truncated', 15);

    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('removes special characters', () => {
    const result = generateSlug('Fix bug #123 in auth!');

    expect(result).toBe('fix-bug-123-auth');
  });
});

describe('DEFAULT_BRANCH_PREFIX', () => {
  it('is parallax', () => {
    expect(DEFAULT_BRANCH_PREFIX).toBe('parallax');
  });
});
