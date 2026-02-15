import { describe, it, expect } from 'vitest';
import {
  SpawnInputSchema,
  StopInputSchema,
  ListInputSchema,
  GetInputSchema,
  SendInputSchema,
  LogsInputSchema,
  MetricsInputSchema,
  HealthInputSchema,
} from '../src/tools/schemas.js';

describe('Tool Schemas', () => {
  describe('SpawnInputSchema', () => {
    it('should validate valid spawn input', () => {
      const input = {
        name: 'test-agent',
        type: 'claude',
        capabilities: ['code_review', 'testing'],
      };

      const result = SpawnInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('test-agent');
        expect(result.data.type).toBe('claude');
        expect(result.data.capabilities).toEqual(['code_review', 'testing']);
        expect(result.data.waitForReady).toBe(true); // Default value
      }
    });

    it('should validate spawn input with all optional fields', () => {
      const input = {
        name: 'full-agent',
        type: 'codex',
        capabilities: ['analysis'],
        role: 'architect',
        workdir: '/path/to/project',
        waitForReady: false,
        env: { API_KEY: 'secret' },
        reportsTo: 'parent-agent-id',
        autoRestart: true,
        idleTimeout: 300,
      };

      const result = SpawnInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('architect');
        expect(result.data.workdir).toBe('/path/to/project');
        expect(result.data.waitForReady).toBe(false);
        expect(result.data.env).toEqual({ API_KEY: 'secret' });
        expect(result.data.autoRestart).toBe(true);
        expect(result.data.idleTimeout).toBe(300);
      }
    });

    it('should reject invalid agent type', () => {
      const input = {
        name: 'test',
        type: 'invalid-type',
        capabilities: [],
      };

      const result = SpawnInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const input = {
        name: 'test',
        // missing type and capabilities
      };

      const result = SpawnInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should accept all valid agent types', () => {
      const types = ['claude', 'codex', 'gemini', 'aider', 'custom'];

      for (const type of types) {
        const input = { name: 'test', type, capabilities: [] };
        const result = SpawnInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('StopInputSchema', () => {
    it('should validate valid stop input', () => {
      const input = {
        agentId: 'agent-123',
      };

      const result = StopInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentId).toBe('agent-123');
        expect(result.data.force).toBe(false); // Default value
      }
    });

    it('should validate stop with options', () => {
      const input = {
        agentId: 'agent-123',
        force: true,
        timeout: 5000,
      };

      const result = StopInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.force).toBe(true);
        expect(result.data.timeout).toBe(5000);
      }
    });

    it('should reject missing agentId', () => {
      const result = StopInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ListInputSchema', () => {
    it('should validate empty filter', () => {
      const result = ListInputSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should validate single status filter', () => {
      const input = { status: 'ready' };
      const result = ListInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate array status filter', () => {
      const input = { status: ['ready', 'busy'] };
      const result = ListInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate type filter', () => {
      const input = { type: 'claude' };
      const result = ListInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate capabilities filter', () => {
      const input = { capabilities: ['code_review', 'testing'] };
      const result = ListInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate combined filters', () => {
      const input = {
        status: 'ready',
        type: ['claude', 'codex'],
        role: 'developer',
        capabilities: ['analysis'],
      };
      const result = ListInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe('GetInputSchema', () => {
    it('should validate valid get input', () => {
      const input = { agentId: 'agent-456' };
      const result = GetInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentId).toBe('agent-456');
      }
    });

    it('should reject missing agentId', () => {
      const result = GetInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('SendInputSchema', () => {
    it('should validate valid send input', () => {
      const input = {
        agentId: 'agent-789',
        message: 'Review this code',
      };

      const result = SendInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentId).toBe('agent-789');
        expect(result.data.message).toBe('Review this code');
        expect(result.data.expectResponse).toBe(false); // Default
      }
    });

    it('should validate send with response options', () => {
      const input = {
        agentId: 'agent-789',
        message: 'Process this',
        expectResponse: true,
        timeout: 30000,
      };

      const result = SendInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expectResponse).toBe(true);
        expect(result.data.timeout).toBe(30000);
      }
    });

    it('should reject missing required fields', () => {
      expect(SendInputSchema.safeParse({ agentId: 'test' }).success).toBe(false);
      expect(SendInputSchema.safeParse({ message: 'test' }).success).toBe(false);
    });
  });

  describe('LogsInputSchema', () => {
    it('should validate valid logs input', () => {
      const input = { agentId: 'agent-123' };
      const result = LogsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should validate logs with tail option', () => {
      const input = { agentId: 'agent-123', tail: 100 };
      const result = LogsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tail).toBe(100);
      }
    });
  });

  describe('MetricsInputSchema', () => {
    it('should validate valid metrics input', () => {
      const input = { agentId: 'agent-123' };
      const result = MetricsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe('HealthInputSchema', () => {
    it('should validate empty health input', () => {
      const result = HealthInputSchema.safeParse({});

      expect(result.success).toBe(true);
    });
  });
});
