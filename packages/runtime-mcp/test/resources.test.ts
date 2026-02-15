import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseAgentUri,
  parseLogsUri,
  listAgentResources,
  listLogsResources,
  readAgentResource,
  readLogsResource,
} from '../src/resources/index.js';

// Create a mock runtime
const createMockRuntime = () => ({
  list: vi.fn().mockResolvedValue([
    {
      id: 'agent-1',
      name: 'Test Agent 1',
      type: 'claude',
      status: 'ready',
      capabilities: ['testing'],
      startedAt: new Date('2024-01-01'),
    },
    {
      id: 'agent-2',
      name: 'Test Agent 2',
      type: 'codex',
      status: 'busy',
      capabilities: ['analysis'],
    },
  ]),
  get: vi.fn().mockImplementation((id: string) => {
    if (id === 'agent-1') {
      return Promise.resolve({
        id: 'agent-1',
        name: 'Test Agent 1',
        type: 'claude',
        status: 'ready',
        capabilities: ['testing'],
        startedAt: new Date('2024-01-01'),
      });
    }
    return Promise.resolve(null);
  }),
  logs: vi.fn().mockImplementation(async function* () {
    yield 'Log line 1';
    yield 'Log line 2';
    yield 'Log line 3';
  }),
});

describe('URI Parsing', () => {
  describe('parseAgentUri', () => {
    it('should parse valid agent URI', () => {
      const agentId = parseAgentUri('agents://agent-123');
      expect(agentId).toBe('agent-123');
    });

    it('should parse agent URI with complex ID', () => {
      const agentId = parseAgentUri('agents://abc-123-def-456');
      expect(agentId).toBe('abc-123-def-456');
    });

    it('should return null for invalid URI', () => {
      expect(parseAgentUri('invalid://agent-123')).toBeNull();
      expect(parseAgentUri('agents://')).toBeNull();
      expect(parseAgentUri('agents:')).toBeNull();
    });
  });

  describe('parseLogsUri', () => {
    it('should parse valid logs URI', () => {
      const agentId = parseLogsUri('logs://agent-123');
      expect(agentId).toBe('agent-123');
    });

    it('should return null for invalid URI', () => {
      expect(parseLogsUri('invalid://agent-123')).toBeNull();
      expect(parseLogsUri('logs://')).toBeNull();
    });
  });
});

describe('Agent Resources', () => {
  let mockRuntime: ReturnType<typeof createMockRuntime>;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  describe('listAgentResources', () => {
    it('should list all agent resources', async () => {
      const resources = await listAgentResources(mockRuntime as any);

      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('agents://agent-1');
      expect(resources[0].name).toBe('Agent: Test Agent 1');
      expect(resources[0].mimeType).toBe('application/json');
      expect(resources[1].uri).toBe('agents://agent-2');
    });

    it('should return empty array when no agents', async () => {
      mockRuntime.list.mockResolvedValue([]);

      const resources = await listAgentResources(mockRuntime as any);

      expect(resources).toHaveLength(0);
    });
  });

  describe('readAgentResource', () => {
    it('should read existing agent resource', async () => {
      const result = await readAgentResource(mockRuntime as any, 'agents://agent-1');

      expect(result).not.toBeNull();
      expect(result!.contents).toHaveLength(1);
      expect(result!.contents[0].uri).toBe('agents://agent-1');
      expect(result!.contents[0].mimeType).toBe('application/json');

      const content = JSON.parse(result!.contents[0].text);
      expect(content.id).toBe('agent-1');
      expect(content.name).toBe('Test Agent 1');
      expect(content.startedAt).toBeDefined(); // ISO string
    });

    it('should return null for invalid URI', async () => {
      const result = await readAgentResource(mockRuntime as any, 'invalid://uri');

      expect(result).toBeNull();
    });

    it('should return null for non-existent agent', async () => {
      const result = await readAgentResource(mockRuntime as any, 'agents://non-existent');

      expect(result).toBeNull();
    });
  });
});

describe('Logs Resources', () => {
  let mockRuntime: ReturnType<typeof createMockRuntime>;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  describe('listLogsResources', () => {
    it('should list all log resources', async () => {
      const resources = await listLogsResources(mockRuntime as any);

      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('logs://agent-1');
      expect(resources[0].name).toBe('Logs: Test Agent 1');
      expect(resources[0].mimeType).toBe('text/plain');
    });
  });

  describe('readLogsResource', () => {
    it('should read agent logs', async () => {
      const result = await readLogsResource(mockRuntime as any, 'logs://agent-1');

      expect(result).not.toBeNull();
      expect(result!.contents).toHaveLength(1);
      expect(result!.contents[0].uri).toBe('logs://agent-1');
      expect(result!.contents[0].mimeType).toBe('text/plain');
      expect(result!.contents[0].text).toContain('Log line 1');
      expect(result!.contents[0].text).toContain('Log line 2');
    });

    it('should return null for invalid URI', async () => {
      const result = await readLogsResource(mockRuntime as any, 'invalid://uri');

      expect(result).toBeNull();
    });

    it('should return null for non-existent agent', async () => {
      const result = await readLogsResource(mockRuntime as any, 'logs://non-existent');

      expect(result).toBeNull();
    });
  });
});
