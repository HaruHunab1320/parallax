import { beforeEach, describe, expect, it } from 'vitest';
import { ensureTmux, resetTmuxCheck } from '../src/ensure-tmux.js';

describe('ensureTmux', () => {
  beforeEach(() => {
    resetTmuxCheck();
  });

  it('should return the tmux version string', () => {
    const version = ensureTmux();
    expect(version).toBeTruthy();
    // tmux 3.x format
    expect(version).toMatch(/\d/);
  });

  it('should cache the result on subsequent calls', () => {
    const v1 = ensureTmux();
    const v2 = ensureTmux();
    expect(v1).toBe(v2);
  });

  it('should call the log callback', () => {
    const logs: string[] = [];
    ensureTmux((msg) => logs.push(msg));
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatch(/tmux.*found/);
  });
});
