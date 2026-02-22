/**
 * Integration test for pty-manager
 *
 * Tests that the package can be imported and used correctly.
 * Run with: npx tsx test-integration.ts
 */

import {
  PTYManager,
  PTYSession,
  AdapterRegistry,
  BaseCLIAdapter,
  ShellAdapter,
  createAdapter,
} from './src/index';

import type {
  SessionHandle,
  SessionMessage,
  SpawnConfig,
  CLIAdapter,
  BlockingPromptInfo,
} from './src/index';

async function runTests() {
  console.log('Running integration tests for pty-manager\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((error) => {
            console.log(`  ✗ ${name}: ${error.message}`);
            failed++;
          });
      }
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${name}: ${(error as Error).message}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('Testing exports...');

  test('PTYManager is exported', () => {
    if (typeof PTYManager !== 'function') throw new Error('Not a constructor');
  });

  test('PTYSession is exported', () => {
    if (typeof PTYSession !== 'function') throw new Error('Not a constructor');
  });

  test('AdapterRegistry is exported', () => {
    if (typeof AdapterRegistry !== 'function') throw new Error('Not a constructor');
  });

  test('BaseCLIAdapter is exported', () => {
    if (typeof BaseCLIAdapter !== 'function') throw new Error('Not a constructor');
  });

  test('ShellAdapter is exported', () => {
    if (typeof ShellAdapter !== 'function') throw new Error('Not a constructor');
  });

  test('createAdapter is exported', () => {
    if (typeof createAdapter !== 'function') throw new Error('Not a function');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting PTYManager...');

  test('PTYManager can be instantiated', () => {
    const manager = new PTYManager();
    if (!manager) throw new Error('Failed to create manager');
  });

  test('PTYManager accepts config', () => {
    const manager = new PTYManager({
      maxLogLines: 500,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    if (!manager) throw new Error('Failed to create manager with config');
  });

  test('PTYManager has adapters property', () => {
    const manager = new PTYManager();
    if (!manager.adapters) throw new Error('No adapters property');
    if (!(manager.adapters instanceof AdapterRegistry)) {
      throw new Error('adapters is not AdapterRegistry');
    }
  });

  test('PTYManager.registerAdapter works', () => {
    const manager = new PTYManager();
    manager.registerAdapter(new ShellAdapter());
    if (!manager.adapters.has('shell')) throw new Error('Shell adapter not registered');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting AdapterRegistry...');

  test('AdapterRegistry can register and retrieve adapters', () => {
    const registry = new AdapterRegistry();
    const adapter = new ShellAdapter();
    registry.register(adapter);

    if (!registry.has('shell')) throw new Error('Adapter not registered');
    if (registry.get('shell') !== adapter) throw new Error('Wrong adapter returned');
  });

  test('AdapterRegistry.list returns registered types', () => {
    const registry = new AdapterRegistry();
    registry.register(new ShellAdapter());
    registry.register(createAdapter({ command: 'test' }));

    const list = registry.list();
    if (!list.includes('shell')) throw new Error('Missing shell');
    if (!list.includes('test')) throw new Error('Missing test');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting ShellAdapter...');

  test('ShellAdapter has correct type', () => {
    const adapter = new ShellAdapter();
    if (adapter.adapterType !== 'shell') throw new Error('Wrong type');
  });

  test('ShellAdapter can be customized', () => {
    const adapter = new ShellAdapter({ shell: '/bin/zsh', prompt: 'custom> ' });
    if (adapter.getCommand() !== '/bin/zsh') throw new Error('Wrong shell');
    const env = adapter.getEnv({ name: 'test', type: 'shell' });
    if (env.PS1 !== 'custom> ') throw new Error('Wrong prompt');
  });

  test('ShellAdapter.detectLogin always returns false', () => {
    const adapter = new ShellAdapter();
    const detection = adapter.detectLogin('any output');
    if (detection.required !== false) throw new Error('Should not require login');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting createAdapter...');

  test('createAdapter creates adapter from config', () => {
    const adapter = createAdapter({
      command: 'my-cli',
      args: ['--flag'],
    });

    if (adapter.getCommand() !== 'my-cli') throw new Error('Wrong command');
    const args = adapter.getArgs({ name: 'test', type: 'my-cli' });
    if (args[0] !== '--flag') throw new Error('Wrong args');
  });

  test('createAdapter supports login detection', () => {
    const adapter = createAdapter({
      command: 'cli',
      loginDetection: {
        patterns: [/please log in/i],
        extractUrl: (output) => output.match(/https:\/\/[^\s]+/)?.[0] || null,
      },
    });

    const detection1 = adapter.detectLogin('Please log in');
    if (!detection1.required) throw new Error('Should detect login');

    const detection2 = adapter.detectLogin('Welcome!');
    if (detection2.required) throw new Error('Should not detect login');
  });

  test('createAdapter supports blocking prompts', () => {
    const adapter = createAdapter({
      command: 'cli',
      blockingPrompts: [
        { pattern: /\[Y\/n\]/i, type: 'config', autoResponse: 'Y' },
      ],
    });

    if (!adapter.detectBlockingPrompt) throw new Error('No detectBlockingPrompt');

    const detection = adapter.detectBlockingPrompt('Continue? [Y/n]');
    if (!detection.detected) throw new Error('Should detect prompt');
    if (detection.type !== 'config') throw new Error('Wrong type');
    if (detection.suggestedResponse !== 'Y') throw new Error('Wrong response');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting type exports...');

  test('Type imports work correctly', () => {
    // These would cause compile errors if types weren't exported
    const config: SpawnConfig = {
      name: 'test',
      type: 'shell',
    };
    if (!config.name) throw new Error('SpawnConfig not working');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
