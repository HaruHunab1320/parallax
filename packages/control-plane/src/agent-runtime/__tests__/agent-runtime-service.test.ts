/**
 * AgentRuntimeService spawn routing tests
 *
 * Covers the boot race: a configured runtime that registers over
 * WebSocket moments after the control plane's HTTP comes up must not
 * lose spawns to the gateway fallthrough — spawnThread waits briefly
 * for pending runtimes and retries.
 */

import { EventEmitter } from 'node:events';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntimeService } from '../agent-runtime-service';

const logger = pino({ level: 'silent' });

function makeClient(overrides: Record<string, unknown> = {}) {
  const client = new EventEmitter() as any;
  client.isConnected = vi.fn().mockReturnValue(true);
  client.spawnThread = vi.fn();
  client.connect = vi.fn().mockResolvedValue(undefined);
  return Object.assign(client, overrides);
}

function register(
  service: AgentRuntimeService,
  name: string,
  client: any,
  { priority = 100, healthy = true } = {}
) {
  (service as any).runtimes.set(name, {
    name,
    type: 'local',
    client,
    priority,
    healthy,
  });
}

describe('AgentRuntimeService.spawnThread', () => {
  let service: AgentRuntimeService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new AgentRuntimeService(logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const input = {
    executionId: 'exec-1',
    name: 'Worker',
    agentType: 'claude',
    objective: 'do things',
  } as any;

  it('spawns on the highest-priority healthy runtime', async () => {
    const gateway = makeClient({
      spawnThread: vi.fn().mockResolvedValue({ id: 't-1', agentId: 'a-1' }),
    });
    register(service, 'gateway', gateway, { priority: 5 });

    const thread = await service.spawnThread(input);
    expect(thread.id).toBe('t-1');
  });

  it('waits for a pending runtime and retries when all healthy runtimes fail', async () => {
    const gateway = makeClient({
      spawnThread: vi
        .fn()
        .mockRejectedValue(
          new Error('No gateway-connected agent found for type=claude')
        ),
    });
    register(service, 'gateway', gateway, { priority: 5 });

    // Local runtime registered but still connecting: comes up after ~1s
    const local = makeClient({
      spawnThread: vi.fn().mockResolvedValue({ id: 't-local', agentId: 'a-2' }),
    });
    let connected = false;
    local.isConnected = vi.fn(() => connected);
    register(service, 'local', local, { priority: 10, healthy: false });
    setTimeout(() => {
      connected = true;
    }, 1000);

    const promise = service.spawnThread(input);
    await vi.advanceTimersByTimeAsync(2000);
    const thread = await promise;

    expect(thread.id).toBe('t-local');
    expect((service as any).runtimes.get('local').healthy).toBe(true);
  });

  it('fails with a hint when a pending runtime never connects', async () => {
    const gateway = makeClient({
      spawnThread: vi
        .fn()
        .mockRejectedValue(
          new Error('No gateway-connected agent found for type=claude')
        ),
    });
    register(service, 'gateway', gateway, { priority: 5 });

    const local = makeClient();
    local.isConnected = vi.fn().mockReturnValue(false);
    register(service, 'local', local, { priority: 10, healthy: false });

    const promise = service.spawnThread(input);
    const assertion = expect(promise).rejects.toThrow(
      /never connected — are they running\?/
    );
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });

  it('fails with the last error when no runtime is pending', async () => {
    const gateway = makeClient({
      spawnThread: vi
        .fn()
        .mockRejectedValue(
          new Error('No gateway-connected agent found for type=claude')
        ),
    });
    register(service, 'gateway', gateway, { priority: 5 });

    await expect(service.spawnThread(input)).rejects.toThrow(
      'No gateway-connected agent found for type=claude'
    );
  });
});
