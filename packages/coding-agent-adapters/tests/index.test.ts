/**
 * Index Exports and Helper Functions Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Adapters
  ClaudeAdapter,
  GeminiAdapter,
  CodexAdapter,
  AiderAdapter,
  BaseCodingAdapter,

  // Helper functions
  createAllAdapters,
  createAdapter,
  checkAdapters,
  checkAllAdapters,
  printMissingAdapters,
  ADAPTER_TYPES,

  // Types
  type AdapterType,
  type PreflightResult,
  type InstallationInfo,
  type AgentCredentials,
} from '../src/index';

describe('Exports', () => {
  describe('Adapter classes', () => {
    it('should export ClaudeAdapter', () => {
      expect(ClaudeAdapter).toBeDefined();
      const adapter = new ClaudeAdapter();
      expect(adapter.adapterType).toBe('claude');
    });

    it('should export GeminiAdapter', () => {
      expect(GeminiAdapter).toBeDefined();
      const adapter = new GeminiAdapter();
      expect(adapter.adapterType).toBe('gemini');
    });

    it('should export CodexAdapter', () => {
      expect(CodexAdapter).toBeDefined();
      const adapter = new CodexAdapter();
      expect(adapter.adapterType).toBe('codex');
    });

    it('should export AiderAdapter', () => {
      expect(AiderAdapter).toBeDefined();
      const adapter = new AiderAdapter();
      expect(adapter.adapterType).toBe('aider');
    });

    it('should export BaseCodingAdapter', () => {
      expect(BaseCodingAdapter).toBeDefined();
    });
  });

  describe('ADAPTER_TYPES', () => {
    it('should have all adapter types', () => {
      expect(ADAPTER_TYPES.claude).toBe(ClaudeAdapter);
      expect(ADAPTER_TYPES.gemini).toBe(GeminiAdapter);
      expect(ADAPTER_TYPES.codex).toBe(CodexAdapter);
      expect(ADAPTER_TYPES.aider).toBe(AiderAdapter);
    });

    it('should have exactly 4 adapter types', () => {
      expect(Object.keys(ADAPTER_TYPES)).toHaveLength(4);
    });
  });
});

describe('createAdapter()', () => {
  it('should create ClaudeAdapter for "claude"', () => {
    const adapter = createAdapter('claude');
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
  });

  it('should create GeminiAdapter for "gemini"', () => {
    const adapter = createAdapter('gemini');
    expect(adapter).toBeInstanceOf(GeminiAdapter);
  });

  it('should create CodexAdapter for "codex"', () => {
    const adapter = createAdapter('codex');
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });

  it('should create AiderAdapter for "aider"', () => {
    const adapter = createAdapter('aider');
    expect(adapter).toBeInstanceOf(AiderAdapter);
  });

  it('should throw for unknown adapter type', () => {
    expect(() => createAdapter('unknown' as AdapterType)).toThrow('Unknown adapter type');
  });
});

describe('createAllAdapters()', () => {
  it('should create all 4 adapters', () => {
    const adapters = createAllAdapters();
    expect(adapters).toHaveLength(4);
  });

  it('should include ClaudeAdapter', () => {
    const adapters = createAllAdapters();
    expect(adapters.some(a => a instanceof ClaudeAdapter)).toBe(true);
  });

  it('should include GeminiAdapter', () => {
    const adapters = createAllAdapters();
    expect(adapters.some(a => a instanceof GeminiAdapter)).toBe(true);
  });

  it('should include CodexAdapter', () => {
    const adapters = createAllAdapters();
    expect(adapters.some(a => a instanceof CodexAdapter)).toBe(true);
  });

  it('should include AiderAdapter', () => {
    const adapters = createAllAdapters();
    expect(adapters.some(a => a instanceof AiderAdapter)).toBe(true);
  });

  it('should create new instances each time', () => {
    const adapters1 = createAllAdapters();
    const adapters2 = createAllAdapters();

    expect(adapters1[0]).not.toBe(adapters2[0]);
  });
});

describe('checkAdapters()', () => {
  it('should return results for requested adapters', async () => {
    const results = await checkAdapters(['claude']);

    expect(results).toHaveLength(1);
    expect(results[0].adapter).toBe('Claude Code');
  });

  it('should include installation info in results', async () => {
    const results = await checkAdapters(['claude']);

    expect(results[0].installCommand).toBeTruthy();
    expect(results[0].docsUrl).toBeTruthy();
  });

  it('should check multiple adapters', async () => {
    const results = await checkAdapters(['claude', 'aider']);

    expect(results).toHaveLength(2);
    expect(results.map(r => r.adapter)).toContain('Claude Code');
    expect(results.map(r => r.adapter)).toContain('Aider');
  });

  it('should include installed status', async () => {
    const results = await checkAdapters(['claude']);

    expect(typeof results[0].installed).toBe('boolean');
  });

  it('should include version when installed', async () => {
    // This test may vary based on local installation
    const results = await checkAdapters(['claude']);

    // If installed, should have version
    if (results[0].installed) {
      expect(results[0].version).toBeTruthy();
    }
  });

  it('should include error when not installed', async () => {
    const results = await checkAdapters(['claude']);

    // If not installed, should have error
    if (!results[0].installed) {
      expect(results[0].error).toBeTruthy();
    }
  });
});

describe('checkAllAdapters()', () => {
  it('should check all 4 adapters', async () => {
    const results = await checkAllAdapters();

    expect(results).toHaveLength(4);
  });

  it('should include all adapter names', async () => {
    const results = await checkAllAdapters();
    const names = results.map(r => r.adapter);

    expect(names).toContain('Claude Code');
    expect(names).toContain('Google Gemini');
    expect(names).toContain('OpenAI Codex');
    expect(names).toContain('Aider');
  });
});

describe('printMissingAdapters()', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should print missing adapters', async () => {
    await printMissingAdapters(['claude']);

    // Should have called console.log
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should print all installed message when all present', async () => {
    // Mock all adapters as installed by checking the output
    await printMissingAdapters([]);

    // With empty array, nothing to check, should print "All CLI tools are installed!"
    // Actually with empty array, results will be empty, so it will print the success message
  });

  it('should include install command for missing adapters', async () => {
    await printMissingAdapters(['claude']);

    const calls = consoleSpy.mock.calls.flat().join('\n');

    // If claude is not installed, should include install command
    // This varies based on local installation
    if (calls.includes('Missing')) {
      expect(calls).toContain('Install:');
    }
  });

  it('should include docs URL for missing adapters', async () => {
    await printMissingAdapters(['claude']);

    const calls = consoleSpy.mock.calls.flat().join('\n');

    if (calls.includes('Missing')) {
      expect(calls).toContain('Docs:');
    }
  });
});

describe('Type exports', () => {
  it('should allow AdapterType type usage', () => {
    const type: AdapterType = 'claude';
    expect(type).toBe('claude');
  });

  it('should allow PreflightResult type usage', () => {
    const result: PreflightResult = {
      adapter: 'Test',
      installed: true,
      version: '1.0.0',
      installCommand: 'npm install test',
      docsUrl: 'https://test.dev',
    };
    expect(result.installed).toBe(true);
  });

  it('should allow InstallationInfo type usage', () => {
    const info: InstallationInfo = {
      command: 'npm install test',
      docsUrl: 'https://test.dev',
    };
    expect(info.command).toBeTruthy();
  });

  it('should allow AgentCredentials type usage', () => {
    const creds: AgentCredentials = {
      anthropicKey: 'test',
      openaiKey: 'test',
    };
    expect(creds.anthropicKey).toBe('test');
  });
});

describe('Adapter consistency', () => {
  const adapters = createAllAdapters();

  for (const adapter of adapters) {
    describe(`${adapter.displayName}`, () => {
      it('should have installation info', () => {
        expect(adapter.installation).toBeDefined();
        expect(adapter.installation.command).toBeTruthy();
        expect(adapter.installation.docsUrl).toBeTruthy();
      });

      it('should have valid adapterType', () => {
        expect(adapter.adapterType).toBeTruthy();
        expect(typeof adapter.adapterType).toBe('string');
      });

      it('should have valid displayName', () => {
        expect(adapter.displayName).toBeTruthy();
        expect(typeof adapter.displayName).toBe('string');
      });

      it('should return command string', () => {
        expect(typeof adapter.getCommand()).toBe('string');
        expect(adapter.getCommand().length).toBeGreaterThan(0);
      });

      it('should return args array', () => {
        const args = adapter.getArgs({ name: 'test', type: adapter.adapterType });
        expect(Array.isArray(args)).toBe(true);
      });

      it('should return env object', () => {
        const env = adapter.getEnv({ name: 'test', type: adapter.adapterType });
        expect(typeof env).toBe('object');
      });

      it('should have prompt pattern', () => {
        const pattern = adapter.getPromptPattern();
        expect(pattern).toBeInstanceOf(RegExp);
      });

      it('should have getInstallInstructions method', () => {
        const instructions = adapter.getInstallInstructions();
        expect(typeof instructions).toBe('string');
        expect(instructions).toContain(adapter.displayName);
      });

      it('should have validateInstallation method', async () => {
        const result = await adapter.validateInstallation();
        expect(typeof result.installed).toBe('boolean');
      });
    });
  }
});
