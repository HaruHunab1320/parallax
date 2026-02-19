import { describe, it, expect } from 'vitest';
import { WATCHED_FILES, getWatchedFiles, getWatchedFilesByCategory } from './watched-files';
import type { AdapterType } from './types';

describe('WATCHED_FILES', () => {
  const adapters: AdapterType[] = ['gemini', 'codex', 'aider', 'claude'];

  it('has entries for all adapter types', () => {
    for (const adapter of adapters) {
      expect(WATCHED_FILES[adapter]).toBeDefined();
      expect(WATCHED_FILES[adapter].adapter).toBe(adapter);
      expect(WATCHED_FILES[adapter].githubRepo).toBeTruthy();
      expect(WATCHED_FILES[adapter].watchedFiles.length).toBeGreaterThan(0);
    }
  });

  it('has correct GitHub repo names', () => {
    expect(WATCHED_FILES.gemini.githubRepo).toBe('google-gemini/gemini-cli');
    expect(WATCHED_FILES.codex.githubRepo).toBe('openai/codex');
    expect(WATCHED_FILES.aider.githubRepo).toBe('Aider-AI/aider');
    expect(WATCHED_FILES.claude.githubRepo).toBe('anthropics/claude-code');
  });

  it('gemini has files for all key categories', () => {
    const categories = WATCHED_FILES.gemini.watchedFiles.map(f => f.category);
    expect(categories).toContain('auth');
    expect(categories).toContain('blocking_prompt');
    expect(categories).toContain('ready_detection');
    expect(categories).toContain('exit_detection');
    expect(categories).toContain('framework');
    expect(categories).toContain('startup');
  });

  it('codex has files for key categories', () => {
    const categories = WATCHED_FILES.codex.watchedFiles.map(f => f.category);
    expect(categories).toContain('auth');
    expect(categories).toContain('blocking_prompt');
    expect(categories).toContain('ready_detection');
    expect(categories).toContain('startup');
    expect(categories).toContain('framework');
  });

  it('aider has files for key categories', () => {
    const categories = WATCHED_FILES.aider.watchedFiles.map(f => f.category);
    expect(categories).toContain('auth');
    expect(categories).toContain('blocking_prompt');
    expect(categories).toContain('exit_detection');
    expect(categories).toContain('framework');
  });

  it('all watched files have valid paths', () => {
    for (const adapter of adapters) {
      for (const file of WATCHED_FILES[adapter].watchedFiles) {
        expect(file.path).toBeTruthy();
        expect(file.path).not.toContain(' ');
        expect(file.category).toMatch(
          /^(blocking_prompt|ready_detection|exit_detection|auth|framework|startup)$/,
        );
      }
    }
  });

  it('gemini watched files include key source files from catalog', () => {
    const paths = WATCHED_FILES.gemini.watchedFiles.map(f => f.path);
    expect(paths).toContain('packages/cli/src/ui/auth/AuthDialog.tsx');
    expect(paths).toContain('packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx');
    expect(paths).toContain('packages/cli/src/ui/components/InputPrompt.tsx');
  });

  it('codex watched files include key source files from catalog', () => {
    const paths = WATCHED_FILES.codex.watchedFiles.map(f => f.path);
    expect(paths).toContain('codex-rs/tui/src/onboarding/auth.rs');
    expect(paths).toContain('codex-rs/tui/src/bottom_pane/approval_overlay.rs');
    expect(paths).toContain('codex-rs/tui/src/bottom_pane/chat_composer.rs');
  });

  it('aider watched files include key source files from catalog', () => {
    const paths = WATCHED_FILES.aider.watchedFiles.map(f => f.path);
    expect(paths).toContain('aider/io.py');
    expect(paths).toContain('aider/onboarding.py');
    expect(paths).toContain('aider/coders/base_coder.py');
  });
});

describe('getWatchedFiles', () => {
  it('returns config for a valid adapter', () => {
    const config = getWatchedFiles('gemini');
    expect(config.adapter).toBe('gemini');
    expect(config.githubRepo).toBe('google-gemini/gemini-cli');
    expect(config.watchedFiles.length).toBeGreaterThan(0);
  });

  it('returns config for each adapter', () => {
    for (const adapter of ['gemini', 'codex', 'aider', 'claude'] as AdapterType[]) {
      const config = getWatchedFiles(adapter);
      expect(config.adapter).toBe(adapter);
    }
  });
});

describe('getWatchedFilesByCategory', () => {
  it('returns only auth files for gemini', () => {
    const authFiles = getWatchedFilesByCategory('gemini', 'auth');
    expect(authFiles.length).toBeGreaterThan(0);
    expect(authFiles).toContain('packages/cli/src/ui/auth/AuthDialog.tsx');
    expect(authFiles).toContain('packages/cli/src/config/auth.ts');
  });

  it('returns only blocking_prompt files for aider', () => {
    const blockingFiles = getWatchedFilesByCategory('aider', 'blocking_prompt');
    expect(blockingFiles.length).toBeGreaterThan(0);
    expect(blockingFiles).toContain('aider/io.py');
    expect(blockingFiles).toContain('aider/coders/base_coder.py');
  });

  it('returns empty array for non-existent category', () => {
    // Claude has no ready_detection files
    const readyFiles = getWatchedFilesByCategory('claude', 'ready_detection');
    expect(readyFiles).toEqual([]);
  });

  it('returns ready_detection files for codex', () => {
    const readyFiles = getWatchedFilesByCategory('codex', 'ready_detection');
    expect(readyFiles).toContain('codex-rs/tui/src/bottom_pane/chat_composer.rs');
  });
});
