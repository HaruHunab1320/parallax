/**
 * Runtime Auto-Response Rules Tests
 *
 * Tests for the runtime rules API on PTYSession and PTYManager.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PTYManager } from './pty-manager';
import { PTYSession } from './pty-session';
import { ShellAdapter } from './adapters/shell-adapter';
import type { AutoResponseRule, BlockingPromptType } from './types';

// Mock adapter for testing
const mockAdapter = {
  adapterType: 'mock',
  displayName: 'Mock Adapter',
  autoResponseRules: [] as AutoResponseRule[],
  getCommand: () => 'echo',
  getArgs: () => ['test'],
  getEnv: () => ({}),
  detectLogin: () => ({ required: false }),
  detectReady: () => false,
  detectExit: () => ({ exited: false }),
  detectBlockingPrompt: () => ({ detected: false }),
  parseOutput: () => null,
  getPromptPattern: () => />/,
  formatInput: (msg: string) => msg,
};

describe('PTYSession Runtime Rules', () => {
  let session: PTYSession;

  beforeEach(() => {
    session = new PTYSession(mockAdapter, { name: 'test', type: 'mock' });
  });

  describe('addAutoResponseRule', () => {
    it('should add a rule', () => {
      const rule: AutoResponseRule = {
        pattern: /test prompt/i,
        type: 'unknown',
        response: 'y',
        description: 'Test rule',
        safe: true,
      };

      session.addAutoResponseRule(rule);
      expect(session.getAutoResponseRules()).toHaveLength(1);
      expect(session.getAutoResponseRules()[0].pattern.source).toBe('test prompt');
    });

    it('should replace rule with same pattern', () => {
      const rule1: AutoResponseRule = {
        pattern: /test/i,
        type: 'unknown',
        response: 'y',
        description: 'First rule',
      };

      const rule2: AutoResponseRule = {
        pattern: /test/i,
        type: 'update',
        response: 'n',
        description: 'Second rule',
      };

      session.addAutoResponseRule(rule1);
      session.addAutoResponseRule(rule2);

      expect(session.getAutoResponseRules()).toHaveLength(1);
      expect(session.getAutoResponseRules()[0].type).toBe('update');
      expect(session.getAutoResponseRules()[0].response).toBe('n');
    });

    it('should not replace rule with different flags', () => {
      const rule1: AutoResponseRule = {
        pattern: /test/i,
        type: 'unknown',
        response: 'y',
        description: 'Case insensitive',
      };

      const rule2: AutoResponseRule = {
        pattern: /test/,
        type: 'unknown',
        response: 'n',
        description: 'Case sensitive',
      };

      session.addAutoResponseRule(rule1);
      session.addAutoResponseRule(rule2);

      expect(session.getAutoResponseRules()).toHaveLength(2);
    });
  });

  describe('removeAutoResponseRule', () => {
    it('should remove a rule by pattern', () => {
      const rule: AutoResponseRule = {
        pattern: /test/i,
        type: 'unknown',
        response: 'y',
        description: 'Test rule',
      };

      session.addAutoResponseRule(rule);
      expect(session.getAutoResponseRules()).toHaveLength(1);

      const removed = session.removeAutoResponseRule(/test/i);
      expect(removed).toBe(true);
      expect(session.getAutoResponseRules()).toHaveLength(0);
    });

    it('should return false if rule not found', () => {
      const removed = session.removeAutoResponseRule(/nonexistent/);
      expect(removed).toBe(false);
    });

    it('should not remove rule with different flags', () => {
      const rule: AutoResponseRule = {
        pattern: /test/i,
        type: 'unknown',
        response: 'y',
        description: 'Test rule',
      };

      session.addAutoResponseRule(rule);

      const removed = session.removeAutoResponseRule(/test/); // No 'i' flag
      expect(removed).toBe(false);
      expect(session.getAutoResponseRules()).toHaveLength(1);
    });
  });

  describe('setAutoResponseRules', () => {
    it('should replace all rules', () => {
      const rule1: AutoResponseRule = {
        pattern: /first/,
        type: 'unknown',
        response: 'y',
        description: 'First',
      };

      session.addAutoResponseRule(rule1);
      expect(session.getAutoResponseRules()).toHaveLength(1);

      const newRules: AutoResponseRule[] = [
        { pattern: /second/, type: 'update', response: 'n', description: 'Second' },
        { pattern: /third/, type: 'tos', response: 'y', description: 'Third' },
      ];

      session.setAutoResponseRules(newRules);
      expect(session.getAutoResponseRules()).toHaveLength(2);
      expect(session.getAutoResponseRules()[0].pattern.source).toBe('second');
      expect(session.getAutoResponseRules()[1].pattern.source).toBe('third');
    });

    it('should accept empty array', () => {
      session.addAutoResponseRule({
        pattern: /test/,
        type: 'unknown',
        response: 'y',
        description: 'Test',
      });

      session.setAutoResponseRules([]);
      expect(session.getAutoResponseRules()).toHaveLength(0);
    });
  });

  describe('clearAutoResponseRules', () => {
    it('should clear all rules', () => {
      session.addAutoResponseRule({
        pattern: /first/,
        type: 'unknown',
        response: 'y',
        description: 'First',
      });
      session.addAutoResponseRule({
        pattern: /second/,
        type: 'update',
        response: 'n',
        description: 'Second',
      });

      expect(session.getAutoResponseRules()).toHaveLength(2);

      session.clearAutoResponseRules();
      expect(session.getAutoResponseRules()).toHaveLength(0);
    });
  });

  describe('getAutoResponseRules', () => {
    it('should return a copy of rules', () => {
      const rule: AutoResponseRule = {
        pattern: /test/,
        type: 'unknown',
        response: 'y',
        description: 'Test',
      };

      session.addAutoResponseRule(rule);

      const rules1 = session.getAutoResponseRules();
      const rules2 = session.getAutoResponseRules();

      expect(rules1).not.toBe(rules2); // Different array instances
      expect(rules1).toEqual(rules2); // Same contents
    });
  });
});

describe('PTYManager Runtime Rules', () => {
  let manager: PTYManager;

  beforeEach(() => {
    manager = new PTYManager();
    manager.registerAdapter(new ShellAdapter());
  });

  describe('rule methods with non-existent session', () => {
    it('addAutoResponseRule should throw', () => {
      expect(() =>
        manager.addAutoResponseRule('nonexistent', {
          pattern: /test/,
          type: 'unknown',
          response: 'y',
          description: 'Test',
        })
      ).toThrow('Session not found: nonexistent');
    });

    it('removeAutoResponseRule should throw', () => {
      expect(() => manager.removeAutoResponseRule('nonexistent', /test/)).toThrow(
        'Session not found: nonexistent'
      );
    });

    it('setAutoResponseRules should throw', () => {
      expect(() => manager.setAutoResponseRules('nonexistent', [])).toThrow(
        'Session not found: nonexistent'
      );
    });

    it('getAutoResponseRules should throw', () => {
      expect(() => manager.getAutoResponseRules('nonexistent')).toThrow(
        'Session not found: nonexistent'
      );
    });

    it('clearAutoResponseRules should throw', () => {
      expect(() => manager.clearAutoResponseRules('nonexistent')).toThrow(
        'Session not found: nonexistent'
      );
    });
  });
});

describe('Rule serialization for IPC', () => {
  it('should correctly round-trip rules through serialization', () => {
    const originalRule: AutoResponseRule = {
      pattern: /update.*\[y\/n\]/i,
      type: 'update' as BlockingPromptType,
      response: 'n',
      description: 'Decline updates',
      safe: true,
    };

    // Serialize
    const serialized = {
      pattern: originalRule.pattern.source,
      flags: originalRule.pattern.flags,
      type: originalRule.type,
      response: originalRule.response,
      description: originalRule.description,
      safe: originalRule.safe,
    };

    // Deserialize
    const deserialized: AutoResponseRule = {
      pattern: new RegExp(serialized.pattern, serialized.flags || ''),
      type: serialized.type,
      response: serialized.response,
      description: serialized.description,
      safe: serialized.safe,
    };

    expect(deserialized.pattern.source).toBe(originalRule.pattern.source);
    expect(deserialized.pattern.flags).toBe(originalRule.pattern.flags);
    expect(deserialized.type).toBe(originalRule.type);
    expect(deserialized.response).toBe(originalRule.response);
    expect(deserialized.description).toBe(originalRule.description);
    expect(deserialized.safe).toBe(originalRule.safe);

    // Test that the pattern still works
    expect(deserialized.pattern.test('Update available [y/n]')).toBe(true);
    expect(deserialized.pattern.test('No match here')).toBe(false);
  });

  it('should correctly round-trip rules with responseType and keys fields', () => {
    const originalRule: AutoResponseRule = {
      pattern: /Update available|Skip until next/i,
      type: 'config' as BlockingPromptType,
      response: '',
      responseType: 'keys',
      keys: ['down', 'enter'],
      description: 'Skip update via TUI menu',
      safe: true,
    };

    // Serialize
    const serialized = {
      pattern: originalRule.pattern.source,
      flags: originalRule.pattern.flags,
      type: originalRule.type,
      response: originalRule.response,
      responseType: originalRule.responseType,
      keys: originalRule.keys,
      description: originalRule.description,
      safe: originalRule.safe,
    };

    // Deserialize
    const deserialized: AutoResponseRule = {
      pattern: new RegExp(serialized.pattern, serialized.flags || ''),
      type: serialized.type,
      response: serialized.response,
      responseType: serialized.responseType,
      keys: serialized.keys,
      description: serialized.description,
      safe: serialized.safe,
    };

    expect(deserialized.pattern.source).toBe(originalRule.pattern.source);
    expect(deserialized.pattern.flags).toBe(originalRule.pattern.flags);
    expect(deserialized.type).toBe(originalRule.type);
    expect(deserialized.response).toBe(originalRule.response);
    expect(deserialized.responseType).toBe('keys');
    expect(deserialized.keys).toEqual(['down', 'enter']);
    expect(deserialized.description).toBe(originalRule.description);
    expect(deserialized.safe).toBe(originalRule.safe);

    // Pattern should still work
    expect(deserialized.pattern.test('Update available')).toBe(true);
    expect(deserialized.pattern.test('Skip until next version')).toBe(true);
  });
});
