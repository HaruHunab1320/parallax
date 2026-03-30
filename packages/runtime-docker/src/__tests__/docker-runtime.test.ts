import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '@parallaxai/runtime-interface';

// ── Mock Dockerode ──────────────────────────────────────────────────────

const mockContainer = {
  id: 'container-abc123',
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  restart: vi.fn().mockResolvedValue(undefined),
  inspect: vi.fn().mockResolvedValue({
    State: { Running: true, Restarting: false, Paused: false, Dead: false, OOMKilled: false },
  }),
  attach: vi.fn().mockImplementation((_opts, cb) => {
    // Simulate a no-op stream
    const stream = {
      on: vi.fn(),
    };
    cb(null, stream);
  }),
  exec: vi.fn().mockResolvedValue({
    start: vi.fn().mockResolvedValue(undefined),
  }),
  stats: vi.fn().mockResolvedValue({
    cpu_stats: {
      cpu_usage: { total_usage: 2000000 },
      system_cpu_usage: 10000000,
      online_cpus: 4,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1000000 },
      system_cpu_usage: 9000000,
    },
    memory_stats: {
      usage: 134217728,
      limit: 2147483648,
    },
  }),
  logs: vi.fn().mockResolvedValue(Buffer.from('line1\nline2\nline3\n')),
};

const mockVolume = {
  inspect: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockDocker = {
  ping: vi.fn().mockResolvedValue('OK'),
  createContainer: vi.fn().mockResolvedValue(mockContainer),
  listContainers: vi.fn().mockResolvedValue([]),
  listNetworks: vi.fn().mockResolvedValue([]),
  createNetwork: vi.fn().mockResolvedValue({}),
  getContainer: vi.fn().mockReturnValue(mockContainer),
  getVolume: vi.fn().mockReturnValue(mockVolume),
  createVolume: vi.fn().mockResolvedValue({}),
};

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => mockDocker),
  };
});

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1234'),
}));

// ── Mock Logger ─────────────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as any;

// ── Import after mocks ─────────────────────────────────────────────────

import { DockerRuntime } from '../docker-runtime';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: 'test-agent',
    type: 'claude',
    capabilities: ['code'],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('DockerRuntime', () => {
  let runtime: DockerRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new DockerRuntime(mockLogger, {
      socketPath: '/var/run/docker.sock',
      network: 'test-network',
    });
  });

  // ── Construction ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('sets name and type', () => {
      expect(runtime.name).toBe('docker');
      expect(runtime.type).toBe('docker');
    });

    it('uses provided options', () => {
      const rt = new DockerRuntime(mockLogger, {
        socketPath: '/custom/docker.sock',
        network: 'custom-net',
        imagePrefix: 'myregistry.io',
      });
      expect(rt.name).toBe('docker');
    });

    it('defaults network when not provided', () => {
      const rt = new DockerRuntime(mockLogger);
      expect(rt.name).toBe('docker');
    });
  });

  // ── Initialize ──────────────────────────────────────────────────────

  describe('initialize', () => {
    it('pings Docker and creates network', async () => {
      await runtime.initialize();

      expect(mockDocker.ping).toHaveBeenCalled();
      expect(mockDocker.listNetworks).toHaveBeenCalledWith({
        filters: { name: ['test-network'] },
      });
      expect(mockDocker.createNetwork).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: 'test-network',
          Driver: 'bridge',
        })
      );
    });

    it('skips network creation if it already exists', async () => {
      mockDocker.listNetworks.mockResolvedValueOnce([{ Name: 'test-network' }]);

      await runtime.initialize();

      expect(mockDocker.createNetwork).not.toHaveBeenCalled();
    });

    it('is idempotent (second call is a no-op)', async () => {
      await runtime.initialize();
      await runtime.initialize();

      expect(mockDocker.ping).toHaveBeenCalledTimes(1);
    });

    it('throws when Docker is unreachable', async () => {
      mockDocker.ping.mockRejectedValueOnce(new Error('connect ENOENT'));

      await expect(runtime.initialize()).rejects.toThrow(
        'Cannot connect to Docker daemon. Is Docker running?'
      );
    });
  });

  // ── Health Check ────────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns healthy when Docker is responsive', async () => {
      mockDocker.listContainers.mockResolvedValueOnce([{}, {}]);

      const result = await runtime.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.message).toContain('2 containers');
    });

    it('returns unhealthy when Docker ping fails', async () => {
      mockDocker.ping.mockRejectedValueOnce(new Error('Docker down'));

      const result = await runtime.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Docker down');
    });

    it('returns unhealthy with generic message for non-Error', async () => {
      mockDocker.ping.mockRejectedValueOnce('something');

      const result = await runtime.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Docker unavailable');
    });
  });

  // ── Spawn ───────────────────────────────────────────────────────────

  describe('spawn', () => {
    it('auto-initializes if not yet initialized', async () => {
      const handle = await runtime.spawn(makeConfig());

      expect(mockDocker.ping).toHaveBeenCalled();
      expect(handle).toBeDefined();
    });

    it('creates a container with correct image and labels', async () => {
      await runtime.initialize();
      const handle = await runtime.spawn(makeConfig({ name: 'my-claude' }));

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'parallax/agent-claude:latest',
          Labels: expect.objectContaining({
            'parallax.managed': 'true',
            'parallax.agent.name': 'my-claude',
            'parallax.agent.type': 'claude',
          }),
        })
      );

      expect(mockContainer.start).toHaveBeenCalled();
      expect(mockContainer.attach).toHaveBeenCalled();
      expect(handle.type).toBe('claude');
      expect(handle.status).toBe('starting');
      expect(handle.containerId).toBe('container-abc123');
    });

    it('uses provided agent id if given', async () => {
      await runtime.initialize();
      const handle = await runtime.spawn(makeConfig({ id: 'custom-id' }));

      expect(handle.id).toBe('custom-id');
    });

    it('generates uuid when id not provided', async () => {
      await runtime.initialize();
      const handle = await runtime.spawn(makeConfig());

      expect(handle.id).toBe('test-uuid-1234');
    });

    it('maps agent types to correct images', async () => {
      await runtime.initialize();

      const types: Array<[string, string]> = [
        ['claude', 'parallax/agent-claude:latest'],
        ['codex', 'parallax/agent-codex:latest'],
        ['gemini', 'parallax/agent-gemini:latest'],
        ['aider', 'parallax/agent-aider:latest'],
        ['custom', 'parallax/agent-base:latest'],
      ];

      for (const [type, expectedImage] of types) {
        mockDocker.createContainer.mockClear();
        await runtime.spawn(makeConfig({ type: type as any }));

        expect(mockDocker.createContainer).toHaveBeenCalledWith(
          expect.objectContaining({ Image: expectedImage })
        );
      }
    });

    it('prepends imagePrefix when configured', async () => {
      const rt = new DockerRuntime(mockLogger, {
        network: 'test-network',
        imagePrefix: 'myregistry.io',
      });
      await rt.initialize();
      await rt.spawn(makeConfig());

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'myregistry.io/parallax/agent-claude:latest',
        })
      );
    });

    it('emits agent_started event', async () => {
      await runtime.initialize();
      const listener = vi.fn();
      runtime.on('agent_started', listener);

      await runtime.spawn(makeConfig());

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'claude', status: 'starting' })
      );
    });

    it('sets up shared auth volume when executionId provided', async () => {
      await runtime.initialize();
      // Volume does not exist yet
      mockVolume.inspect.mockRejectedValueOnce(new Error('no such volume'));

      await runtime.spawn(
        makeConfig({ executionId: 'exec-12345678-abcd' })
      );

      expect(mockDocker.createVolume).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: 'parallax-auth-exec-123',
          Labels: expect.objectContaining({
            'parallax.purpose': 'shared-auth',
          }),
        })
      );

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Binds: expect.arrayContaining([
              'parallax-auth-exec-123:/home/agent/.claude',
            ]),
          }),
        })
      );
    });

    it('skips volume creation if it already exists', async () => {
      await runtime.initialize();
      mockVolume.inspect.mockResolvedValueOnce({});

      await runtime.spawn(makeConfig({ executionId: 'exec-99999999-zzzz' }));

      expect(mockDocker.createVolume).not.toHaveBeenCalled();
    });
  });

  // ── Build Env ───────────────────────────────────────────────────────

  describe('spawn (environment variables)', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('includes agent identity env vars', async () => {
      await runtime.spawn(
        makeConfig({ id: 'a1', name: 'Agent-1', type: 'claude', role: 'architect' })
      );

      const envArg = mockDocker.createContainer.mock.calls[0][0].Env as string[];
      expect(envArg).toContain('AGENT_ID=a1');
      expect(envArg).toContain('AGENT_NAME=Agent-1');
      expect(envArg).toContain('AGENT_TYPE=claude');
      expect(envArg).toContain('AGENT_ROLE=architect');
    });

    it('includes credentials when provided', async () => {
      await runtime.spawn(
        makeConfig({
          credentials: {
            anthropicKey: 'sk-ant-test',
            openaiKey: 'sk-openai-test',
            googleKey: 'goog-test',
            githubToken: 'ghp-test',
          },
        })
      );

      const envArg = mockDocker.createContainer.mock.calls[0][0].Env as string[];
      expect(envArg).toContain('ANTHROPIC_API_KEY=sk-ant-test');
      expect(envArg).toContain('OPENAI_API_KEY=sk-openai-test');
      expect(envArg).toContain('GOOGLE_API_KEY=goog-test');
      expect(envArg).toContain('GITHUB_TOKEN=ghp-test');
    });

    it('includes custom env vars', async () => {
      await runtime.spawn(
        makeConfig({ env: { MY_VAR: 'hello', OTHER: '42' } })
      );

      const envArg = mockDocker.createContainer.mock.calls[0][0].Env as string[];
      expect(envArg).toContain('MY_VAR=hello');
      expect(envArg).toContain('OTHER=42');
    });

    it('includes executionId env when provided', async () => {
      await runtime.spawn(makeConfig({ executionId: 'exec-abcdef00' }));

      const envArg = mockDocker.createContainer.mock.calls[0][0].Env as string[];
      expect(envArg).toContain('PARALLAX_EXECUTION_ID=exec-abcdef00');
    });

    it('includes registry endpoint when configured', async () => {
      const rt = new DockerRuntime(mockLogger, {
        network: 'test-network',
        registryEndpoint: 'registry.example.com:50051',
      });
      await rt.initialize();
      await rt.spawn(makeConfig());

      const envArg = mockDocker.createContainer.mock.calls[0][0].Env as string[];
      expect(envArg).toContain(
        'PARALLAX_REGISTRY_ENDPOINT=registry.example.com:50051'
      );
    });
  });

  // ── Resource parsing ────────────────────────────────────────────────

  describe('spawn (resource limits)', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('parses memory in Mi', async () => {
      await runtime.spawn(makeConfig({ resources: { memory: '512Mi' } }));

      const hostConfig = mockDocker.createContainer.mock.calls[0][0].HostConfig;
      expect(hostConfig.Memory).toBe(512 * 1024 * 1024);
    });

    it('parses memory in Gi', async () => {
      await runtime.spawn(makeConfig({ resources: { memory: '2Gi' } }));

      const hostConfig = mockDocker.createContainer.mock.calls[0][0].HostConfig;
      expect(hostConfig.Memory).toBe(2 * 1024 * 1024 * 1024);
    });

    it('parses memory in G', async () => {
      await runtime.spawn(makeConfig({ resources: { memory: '4G' } }));

      const hostConfig = mockDocker.createContainer.mock.calls[0][0].HostConfig;
      expect(hostConfig.Memory).toBe(4 * 1024 * 1024 * 1024);
    });

    it('parses CPU in whole cores', async () => {
      await runtime.spawn(makeConfig({ resources: { cpu: '2' } }));

      const hostConfig = mockDocker.createContainer.mock.calls[0][0].HostConfig;
      expect(hostConfig.CpuQuota).toBe(200000);
      expect(hostConfig.CpuPeriod).toBe(100000);
    });

    it('parses CPU in millicores', async () => {
      await runtime.spawn(makeConfig({ resources: { cpu: '500m' } }));

      const hostConfig = mockDocker.createContainer.mock.calls[0][0].HostConfig;
      expect(hostConfig.CpuQuota).toBe(50000);
    });

    it('uses default resources when configured and no per-agent override', async () => {
      const rt = new DockerRuntime(mockLogger, {
        network: 'test-network',
        defaultResources: { cpu: '1', memory: '2Gi' },
      });
      await rt.initialize();
      await rt.spawn(makeConfig());

      const hostConfig = mockDocker.createContainer.mock.calls[0][0].HostConfig;
      expect(hostConfig.Memory).toBe(2 * 1024 * 1024 * 1024);
      expect(hostConfig.CpuQuota).toBe(100000);
    });
  });

  // ── Stop ────────────────────────────────────────────────────────────

  describe('stop', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('stops and removes the container gracefully', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      await runtime.stop('agent-1');

      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(mockContainer.remove).toHaveBeenCalled();
    });

    it('force-kills when options.force is true', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      await runtime.stop('agent-1', { force: true });

      expect(mockContainer.kill).toHaveBeenCalled();
      expect(mockContainer.stop).not.toHaveBeenCalled();
    });

    it('uses custom timeout', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      await runtime.stop('agent-1', { timeout: 30000 });

      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 30 });
    });

    it('emits agent_stopped event', async () => {
      const listener = vi.fn();
      runtime.on('agent_stopped', listener);
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      await runtime.stop('agent-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1', status: 'stopped' }),
        'stopped'
      );
    });

    it('throws for unknown agent', async () => {
      await expect(runtime.stop('nonexistent')).rejects.toThrow(
        'Agent nonexistent not found'
      );
    });

    it('ignores "not running" errors during stop', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      mockContainer.stop.mockRejectedValueOnce(
        new Error('container is not running')
      );

      await expect(runtime.stop('agent-1')).resolves.toBeUndefined();
    });

    it('rethrows other errors from stop', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      mockContainer.stop.mockRejectedValueOnce(
        new Error('permission denied')
      );

      await expect(runtime.stop('agent-1')).rejects.toThrow('permission denied');
    });

    it('removes agent from internal map after stop', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      await runtime.stop('agent-1');

      const handle = await runtime.get('agent-1');
      expect(handle).toBeNull();
    });
  });

  // ── Restart ─────────────────────────────────────────────────────────

  describe('restart', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('restarts the container and resets status', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      const handle = await runtime.restart('agent-1');

      expect(mockContainer.restart).toHaveBeenCalled();
      expect(handle.status).toBe('starting');
      expect(handle.startedAt).toBeInstanceOf(Date);
    });

    it('re-attaches to container output', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      mockContainer.attach.mockClear();

      await runtime.restart('agent-1');

      expect(mockContainer.attach).toHaveBeenCalled();
    });

    it('throws for unknown agent', async () => {
      await expect(runtime.restart('nonexistent')).rejects.toThrow(
        'Agent nonexistent not found'
      );
    });
  });

  // ── Get ─────────────────────────────────────────────────────────────

  describe('get', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('returns the agent handle with updated status', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      const handle = await runtime.get('agent-1');

      expect(handle).not.toBeNull();
      expect(handle!.id).toBe('agent-1');
      expect(handle!.status).toBe('ready'); // Running container maps to 'ready'
    });

    it('returns null for unknown agent', async () => {
      const handle = await runtime.get('nonexistent');
      expect(handle).toBeNull();
    });

    it('removes and returns null if container inspect fails', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      mockContainer.inspect.mockRejectedValueOnce(new Error('no such container'));

      const handle = await runtime.get('agent-1');
      expect(handle).toBeNull();
    });

    it('maps Docker states correctly', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      // Test Paused -> busy
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: false, Restarting: false, Paused: true, Dead: false, OOMKilled: false },
      });
      let handle = await runtime.get('agent-1');
      expect(handle!.status).toBe('busy');

      // Re-spawn since previous get may have cleared
      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: false, Restarting: true, Paused: false, Dead: false, OOMKilled: false },
      });
      handle = await runtime.get('agent-1');
      expect(handle!.status).toBe('starting');

      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: false, Restarting: false, Paused: false, Dead: true, OOMKilled: false },
      });
      handle = await runtime.get('agent-1');
      expect(handle!.status).toBe('error');

      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: false, Restarting: false, Paused: false, Dead: false, OOMKilled: true },
      });
      handle = await runtime.get('agent-1');
      expect(handle!.status).toBe('error');

      mockContainer.inspect.mockResolvedValueOnce({
        State: { Running: false, Restarting: false, Paused: false, Dead: false, OOMKilled: false },
      });
      handle = await runtime.get('agent-1');
      expect(handle!.status).toBe('stopped');
    });
  });

  // ── List ────────────────────────────────────────────────────────────

  describe('list', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    /**
     * Helper: after spawning agents, `list()` calls `syncContainers()` which
     * uses `docker.listContainers`. We must return entries matching the agents
     * we spawned so they don't get pruned from the internal map.
     */
    function stubListContainersFor(
      ...agents: Array<{ id: string; type?: string; role?: string; capabilities?: string[] }>
    ) {
      const result = agents.map((a) => ({
        Id: `container-${a.id}`,
        State: 'running',
        Labels: {
          'parallax.managed': 'true',
          'parallax.agent.id': a.id,
          'parallax.agent.name': a.id,
          'parallax.agent.type': a.type || 'claude',
          'parallax.agent.capabilities': JSON.stringify(a.capabilities || ['code']),
          'parallax.agent.role': a.role || '',
        },
      }));
      mockDocker.listContainers.mockResolvedValue(result);
    }

    it('returns all agents when no filter', async () => {
      await runtime.spawn(makeConfig({ id: 'a1', type: 'claude', role: 'architect' }));
      await runtime.spawn(makeConfig({ id: 'a2', type: 'codex', role: 'engineer' }));
      stubListContainersFor(
        { id: 'a1', type: 'claude', role: 'architect' },
        { id: 'a2', type: 'codex', role: 'engineer' }
      );

      const handles = await runtime.list();

      expect(handles).toHaveLength(2);
    });

    it('filters by status', async () => {
      await runtime.spawn(makeConfig({ id: 'a1' }));
      await runtime.spawn(makeConfig({ id: 'a2' }));
      stubListContainersFor({ id: 'a1' }, { id: 'a2' });

      // Both have status 'starting' after spawn
      const handles = await runtime.list({ status: 'starting' });
      expect(handles).toHaveLength(2);

      const empty = await runtime.list({ status: 'error' });
      expect(empty).toHaveLength(0);
    });

    it('filters by type', async () => {
      await runtime.spawn(makeConfig({ id: 'a1', type: 'claude' }));
      await runtime.spawn(makeConfig({ id: 'a2', type: 'codex' }));
      stubListContainersFor(
        { id: 'a1', type: 'claude' },
        { id: 'a2', type: 'codex' }
      );

      const handles = await runtime.list({ type: 'claude' });
      expect(handles).toHaveLength(1);
      expect(handles[0].type).toBe('claude');
    });

    it('filters by type array', async () => {
      await runtime.spawn(makeConfig({ id: 'a1', type: 'claude' }));
      await runtime.spawn(makeConfig({ id: 'a2', type: 'codex' }));
      await runtime.spawn(makeConfig({ id: 'a3', type: 'gemini' }));
      stubListContainersFor(
        { id: 'a1', type: 'claude' },
        { id: 'a2', type: 'codex' },
        { id: 'a3', type: 'gemini' }
      );

      const handles = await runtime.list({ type: ['claude', 'gemini'] });
      expect(handles).toHaveLength(2);
    });

    it('filters by role', async () => {
      await runtime.spawn(makeConfig({ id: 'a1', role: 'architect' }));
      await runtime.spawn(makeConfig({ id: 'a2', role: 'engineer' }));
      stubListContainersFor(
        { id: 'a1', role: 'architect' },
        { id: 'a2', role: 'engineer' }
      );

      const handles = await runtime.list({ role: 'architect' });
      expect(handles).toHaveLength(1);
    });

    it('filters by capabilities', async () => {
      await runtime.spawn(
        makeConfig({ id: 'a1', capabilities: ['code', 'test'] })
      );
      await runtime.spawn(
        makeConfig({ id: 'a2', capabilities: ['code'] })
      );
      stubListContainersFor(
        { id: 'a1', capabilities: ['code', 'test'] },
        { id: 'a2', capabilities: ['code'] }
      );

      const handles = await runtime.list({ capabilities: ['code', 'test'] });
      expect(handles).toHaveLength(1);
      expect(handles[0].id).toBe('a1');
    });

    it('syncs with Docker to discover untracked containers', async () => {
      mockDocker.listContainers.mockResolvedValueOnce([
        {
          Id: 'docker-container-xyz',
          State: 'running',
          Labels: {
            'parallax.managed': 'true',
            'parallax.agent.id': 'discovered-agent',
            'parallax.agent.name': 'Discovered',
            'parallax.agent.type': 'gemini',
            'parallax.agent.capabilities': '["search"]',
            'parallax.agent.role': 'researcher',
          },
        },
      ]);

      const handles = await runtime.list();

      expect(handles.some((h) => h.id === 'discovered-agent')).toBe(true);
    });
  });

  // ── Send ────────────────────────────────────────────────────────────

  describe('send', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('executes a command in the container', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      await runtime.send('agent-1', 'Hello agent');

      expect(mockContainer.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          Cmd: expect.arrayContaining(['sh', '-c']),
          AttachStdout: true,
          AttachStderr: true,
        })
      );
    });

    it('throws for unknown agent', async () => {
      await expect(runtime.send('nonexistent', 'hello')).rejects.toThrow(
        'Agent nonexistent not found'
      );
    });
  });

  // ── Logs ────────────────────────────────────────────────────────────

  describe('logs', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('yields log lines from the container', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      const lines: string[] = [];
      for await (const line of runtime.logs('agent-1')) {
        lines.push(line);
      }

      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('passes tail option', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      const lines: string[] = [];
      for await (const line of runtime.logs('agent-1', { tail: 50 })) {
        lines.push(line);
      }

      expect(mockContainer.logs).toHaveBeenCalledWith(
        expect.objectContaining({ tail: 50 })
      );
    });

    it('passes since option as unix seconds', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      const since = new Date('2025-01-01T00:00:00Z');

      const lines: string[] = [];
      for await (const line of runtime.logs('agent-1', { since })) {
        lines.push(line);
      }

      expect(mockContainer.logs).toHaveBeenCalledWith(
        expect.objectContaining({
          since: Math.floor(since.getTime() / 1000),
        })
      );
    });

    it('throws for unknown agent', async () => {
      await expect(async () => {
        for await (const _line of runtime.logs('nonexistent')) {
          // consume
        }
      }).rejects.toThrow('Agent nonexistent not found');
    });
  });

  // ── Metrics ─────────────────────────────────────────────────────────

  describe('metrics', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('returns computed CPU and memory metrics', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));

      const m = await runtime.metrics('agent-1');

      expect(m).not.toBeNull();
      // CPU: (2M-1M) / (10M-9M) * 4 * 100 = 400%
      expect(m!.cpu).toBe(400);
      expect(m!.memory).toBe(134217728);
      expect(m!.uptime).toBeGreaterThanOrEqual(0);
      expect(m!.messageCount).toBe(0);
    });

    it('returns null for unknown agent', async () => {
      const m = await runtime.metrics('nonexistent');
      expect(m).toBeNull();
    });

    it('returns null when stats call fails', async () => {
      await runtime.spawn(makeConfig({ id: 'agent-1' }));
      mockContainer.stats.mockRejectedValueOnce(new Error('container gone'));

      const m = await runtime.metrics('agent-1');
      expect(m).toBeNull();
    });
  });

  // ── Shutdown ────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('stops all agents when stopAgents=true (default)', async () => {
      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'a1' }));
      await runtime.spawn(makeConfig({ id: 'a2' }));

      await runtime.shutdown();

      // Each agent gets killed (force: true in shutdown)
      expect(mockContainer.kill).toHaveBeenCalledTimes(2);
    });

    it('does not stop agents when stopAgents=false', async () => {
      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'a1' }));

      await runtime.shutdown(false);

      expect(mockContainer.kill).not.toHaveBeenCalled();
      expect(mockContainer.stop).not.toHaveBeenCalled();
    });

    it('clears internal state', async () => {
      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'a1' }));

      await runtime.shutdown(false);

      // After shutdown, list should return empty (and re-init needed)
      // Access internal state indirectly via get
      const handle = await runtime.get('a1');
      expect(handle).toBeNull();
    });
  });

  // ── Cleanup Execution ───────────────────────────────────────────────

  describe('cleanupExecution', () => {
    it('removes the shared auth volume', async () => {
      await runtime.cleanupExecution('exec-12345678-abcd');

      expect(mockDocker.getVolume).toHaveBeenCalledWith('parallax-auth-exec-123');
      expect(mockVolume.remove).toHaveBeenCalled();
    });

    it('ignores "no such volume" errors', async () => {
      mockVolume.remove.mockRejectedValueOnce(
        new Error('no such volume')
      );

      await expect(
        runtime.cleanupExecution('exec-99999999')
      ).resolves.toBeUndefined();
    });

    it('logs warning for other removal errors', async () => {
      mockVolume.remove.mockRejectedValueOnce(
        new Error('volume is in use')
      );

      await runtime.cleanupExecution('exec-aaaaaaaa');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'volume is in use' }),
        expect.any(String)
      );
    });
  });

  // ── Subscribe ───────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('throws for unknown agent', async () => {
      await expect(async () => {
        for await (const _msg of runtime.subscribe('nonexistent')) {
          break;
        }
      }).rejects.toThrow('Agent nonexistent not found');
    });
  });

  // ── Detect ready / login patterns ─────────────────────────────────

  describe('attachToContainer output detection', () => {
    it('emits agent_ready when output contains ready marker', async () => {
      // Override attach to emit data
      mockContainer.attach.mockImplementationOnce((_opts: any, cb: any) => {
        const handlers: Record<string, Function> = {};
        const stream = {
          on: vi.fn((event: string, handler: Function) => {
            handlers[event] = handler;
          }),
        };
        cb(null, stream);

        // Simulate output after attach
        setTimeout(() => {
          if (handlers['data']) {
            handlers['data'](Buffer.from('Claude Code is ready'));
          }
        }, 10);
      });

      const readyListener = vi.fn();
      runtime.on('agent_ready', readyListener);

      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'agent-ready-test' }));

      // Wait for the async data event
      await new Promise((r) => setTimeout(r, 50));

      expect(readyListener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-ready-test', status: 'ready' })
      );
    });

    it('emits login_required when output contains auth patterns', async () => {
      mockContainer.attach.mockImplementationOnce((_opts: any, cb: any) => {
        const handlers: Record<string, Function> = {};
        const stream = {
          on: vi.fn((event: string, handler: Function) => {
            handlers[event] = handler;
          }),
        };
        cb(null, stream);

        setTimeout(() => {
          if (handlers['data']) {
            handlers['data'](Buffer.from('Please sign in to continue'));
          }
        }, 10);
      });

      const loginListener = vi.fn();
      runtime.on('login_required', loginListener);

      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'agent-login-test' }));

      await new Promise((r) => setTimeout(r, 50));

      expect(loginListener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-login-test' })
      );
    });

    it('emits agent_stopped when stream ends', async () => {
      mockContainer.attach.mockImplementationOnce((_opts: any, cb: any) => {
        const handlers: Record<string, Function> = {};
        const stream = {
          on: vi.fn((event: string, handler: Function) => {
            handlers[event] = handler;
          }),
        };
        cb(null, stream);

        setTimeout(() => {
          if (handlers['end']) {
            handlers['end']();
          }
        }, 10);
      });

      const stoppedListener = vi.fn();
      runtime.on('agent_stopped', stoppedListener);

      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'agent-end-test' }));

      await new Promise((r) => setTimeout(r, 50));

      expect(stoppedListener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-end-test', status: 'stopped' }),
        'container exited'
      );
    });

    it('parses JSON messages from output', async () => {
      mockContainer.attach.mockImplementationOnce((_opts: any, cb: any) => {
        const handlers: Record<string, Function> = {};
        const stream = {
          on: vi.fn((event: string, handler: Function) => {
            handlers[event] = handler;
          }),
        };
        cb(null, stream);

        setTimeout(() => {
          if (handlers['data']) {
            handlers['data'](
              Buffer.from('{"type":"response","content":"Hello from agent"}')
            );
          }
        }, 10);
      });

      const messageListener = vi.fn();
      runtime.on('message', messageListener);

      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'agent-msg-test' }));

      await new Promise((r) => setTimeout(r, 50));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-msg-test',
          direction: 'outbound',
          type: 'response',
          content: 'Hello from agent',
        })
      );
    });

    it('parses DONE marker as a response', async () => {
      mockContainer.attach.mockImplementationOnce((_opts: any, cb: any) => {
        const handlers: Record<string, Function> = {};
        const stream = {
          on: vi.fn((event: string, handler: Function) => {
            handlers[event] = handler;
          }),
        };
        cb(null, stream);

        setTimeout(() => {
          if (handlers['data']) {
            handlers['data'](Buffer.from('Some output text [DONE]'));
          }
        }, 10);
      });

      const messageListener = vi.fn();
      runtime.on('message', messageListener);

      await runtime.initialize();
      await runtime.spawn(makeConfig({ id: 'agent-done-test' }));

      await new Promise((r) => setTimeout(r, 50));

      expect(messageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-done-test',
          type: 'response',
          content: 'Some output text',
        })
      );
    });
  });
});
