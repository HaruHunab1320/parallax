import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFileChanges, listWatchedFiles } from './file-change-checker';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('checkFileChanges', () => {
  it('detects changed watched files from GitHub compare response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 5,
        behind_by: 0,
        total_commits: 5,
        files: [
          { filename: 'aider/io.py', status: 'modified' },
          { filename: 'aider/main.py', status: 'modified' },
          { filename: 'aider/unrelated_file.py', status: 'added' },
          { filename: 'docs/README.md', status: 'modified' },
        ],
      }),
    });

    const result = await checkFileChanges('aider', '0.81.0', '0.82.0');

    expect(result.adapter).toBe('aider');
    expect(result.oldVersion).toBe('0.81.0');
    expect(result.newVersion).toBe('0.82.0');
    expect(result.changedFiles).toHaveLength(2);
    expect(result.changedFiles[0]).toEqual({
      path: 'aider/io.py',
      category: 'blocking_prompt',
      status: 'modified',
    });
    expect(result.changedFiles[1]).toEqual({
      path: 'aider/main.py',
      category: 'blocking_prompt',
      status: 'modified',
    });
    expect(result.adapterUpdateNeeded).toBe(true);
  });

  it('reports no adapter update needed when only framework files change', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 2,
        behind_by: 0,
        total_commits: 2,
        files: [
          { filename: 'aider/waiting.py', status: 'modified' },
        ],
      }),
    });

    const result = await checkFileChanges('aider', '0.81.0', '0.82.0');

    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].category).toBe('framework');
    expect(result.adapterUpdateNeeded).toBe(false);
  });

  it('reports no changes when no watched files are in the diff', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 10,
        behind_by: 0,
        total_commits: 10,
        files: [
          { filename: 'setup.py', status: 'modified' },
          { filename: 'tests/test_foo.py', status: 'added' },
        ],
      }),
    });

    const result = await checkFileChanges('aider', '0.81.0', '0.82.0');

    expect(result.changedFiles).toHaveLength(0);
    expect(result.adapterUpdateNeeded).toBe(false);
    expect(result.summary).toContain('No watched files changed');
  });

  it('normalizes version tags with v prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        files: [],
      }),
    });

    await checkFileChanges('gemini', '1.0.0', '1.1.0');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/google-gemini/gemini-cli/compare/v1.0.0...v1.1.0',
      expect.any(Object),
    );
  });

  it('preserves version strings that already have v prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        files: [],
      }),
    });

    await checkFileChanges('codex', 'v0.1.0', 'v0.2.0');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/openai/codex/compare/v0.1.0...v0.2.0',
      expect.any(Object),
    );
  });

  it('throws on 404 with helpful message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(checkFileChanges('gemini', '0.0.1', '99.99.99'))
      .rejects.toThrow(/Tags not found/);
  });

  it('throws on other API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(checkFileChanges('gemini', '1.0.0', '1.1.0'))
      .rejects.toThrow(/GitHub API error/);
  });

  it('includes GITHUB_TOKEN in headers when available', async () => {
    const originalToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token-123';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        files: [],
      }),
    });

    await checkFileChanges('aider', '0.81.0', '0.82.0');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'token test-token-123',
        }),
      }),
    );

    // Restore
    if (originalToken) {
      process.env.GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('detects auth file changes as requiring adapter update', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 3,
        behind_by: 0,
        total_commits: 3,
        files: [
          { filename: 'packages/cli/src/ui/auth/AuthDialog.tsx', status: 'modified' },
        ],
      }),
    });

    const result = await checkFileChanges('gemini', '1.0.0', '1.1.0');

    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].category).toBe('auth');
    expect(result.adapterUpdateNeeded).toBe(true);
  });

  it('detects ready_detection changes as requiring adapter update', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        files: [
          { filename: 'codex-rs/tui/src/bottom_pane/chat_composer.rs', status: 'modified' },
        ],
      }),
    });

    const result = await checkFileChanges('codex', '0.1.0', '0.2.0');

    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].category).toBe('ready_detection');
    expect(result.adapterUpdateNeeded).toBe(true);
  });

  it('handles empty files array in GitHub response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'identical',
        ahead_by: 0,
        behind_by: 0,
        total_commits: 0,
        files: [],
      }),
    });

    const result = await checkFileChanges('aider', '0.82.0', '0.82.0');
    expect(result.changedFiles).toHaveLength(0);
    expect(result.adapterUpdateNeeded).toBe(false);
  });

  it('generates readable summary with category grouping', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ahead',
        ahead_by: 8,
        behind_by: 0,
        total_commits: 8,
        files: [
          { filename: 'packages/cli/src/ui/auth/AuthDialog.tsx', status: 'modified' },
          { filename: 'packages/cli/src/ui/components/InputPrompt.tsx', status: 'modified' },
          { filename: 'packages/cli/src/gemini.tsx', status: 'modified' },
        ],
      }),
    });

    const result = await checkFileChanges('gemini', '1.0.0', '1.1.0');

    expect(result.summary).toContain('gemini: 1.0.0');
    expect(result.summary).toContain('1.1.0');
    expect(result.summary).toContain('8 commits');
    expect(result.summary).toContain('[auth]');
    expect(result.summary).toContain('[ready_detection]');
    expect(result.summary).toContain('[framework]');
    expect(result.summary).toContain('critical file(s) changed');
  });
});

describe('listWatchedFiles', () => {
  it('returns files grouped by category for gemini', () => {
    const grouped = listWatchedFiles('gemini');

    expect(grouped.auth).toBeDefined();
    expect(grouped.auth.length).toBeGreaterThan(0);
    expect(grouped.blocking_prompt).toBeDefined();
    expect(grouped.ready_detection).toBeDefined();
  });

  it('returns files grouped by category for aider', () => {
    const grouped = listWatchedFiles('aider');

    expect(grouped.auth).toBeDefined();
    expect(grouped.blocking_prompt).toBeDefined();
    expect(grouped.blocking_prompt).toContain('aider/io.py');
  });

  it('returns files grouped by category for codex', () => {
    const grouped = listWatchedFiles('codex');

    expect(grouped.auth).toBeDefined();
    expect(grouped.blocking_prompt).toBeDefined();
    expect(grouped.ready_detection).toBeDefined();
  });

  it('returns files grouped by category for claude', () => {
    const grouped = listWatchedFiles('claude');

    expect(grouped.blocking_prompt).toBeDefined();
    expect(grouped.startup).toBeDefined();
  });
});
