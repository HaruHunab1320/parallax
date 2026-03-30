/**
 * Ensure tmux is installed and accessible.
 *
 * Checks that tmux is available on PATH and returns its version.
 * Throws a descriptive error if tmux is not found.
 */

import { execSync } from 'node:child_process';

let _checked = false;
let _version: string | undefined;

/**
 * Verify that tmux is installed and usable.
 * Caches the result after the first successful check.
 *
 * @param log - Optional log callback for status messages
 * @returns The tmux version string (e.g., "3.4")
 */
export function ensureTmux(log?: (msg: string) => void): string {
  if (_checked && _version) {
    return _version;
  }

  try {
    const output = execSync('tmux -V', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // tmux -V outputs something like "tmux 3.4" or "tmux next-3.5"
    const match = output.match(/tmux\s+([\w.-]+)/);
    _version = match?.[1] ?? output;
    _checked = true;

    log?.(`tmux ${_version} found`);
    return _version;
  } catch {
    throw new Error(
      'tmux is required but not found on PATH. ' +
        'Install it with: brew install tmux (macOS) or apt install tmux (Linux)'
    );
  }
}

/**
 * Reset the cached check (useful for testing).
 */
export function resetTmuxCheck(): void {
  _checked = false;
  _version = undefined;
}
