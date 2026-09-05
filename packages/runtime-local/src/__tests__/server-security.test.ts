import { EventEmitter, once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  executionResourceName,
  runtimeSecurity,
} from '@parallaxai/runtime-interface';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { RuntimeServer } from '../server';

const key = 'runtime-test-key-012345678901234567890';
const headers = { 'x-parallax-runtime-key': key };

describe('runtime transport security', () => {
  let server: RuntimeServer;
  let runtime: EventEmitter & Record<string, any>;
  let base: string;
  beforeEach(async () => {
    runtime = Object.assign(new EventEmitter(), {
      healthCheck: vi.fn().mockResolvedValue({
        healthy: true,
        message: 'private runtime detail',
      }),
      list: vi.fn().mockResolvedValue([]),
      spawn: vi.fn(),
      cleanupExecution: vi.fn().mockResolvedValue(undefined),
    });
    server = new RuntimeServer(runtime as any, pino({ level: 'silent' }), {
      port: 0,
      host: '127.0.0.1',
      apiKey: key,
      authMode: 'required',
    });
    await server.start();
    base = `http://127.0.0.1:${((server as any).server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await server.stop();
    vi.unstubAllEnvs();
  });

  it('allows only a minimal unauthenticated health probe', async () => {
    const response = await fetch(`${base}/health`);
    expect(await response.json()).toEqual({ healthy: true });
    expect((await fetch(`${base}/api/health`)).status).toBe(401);
    expect(runtime.healthCheck).not.toHaveBeenCalled();
  });

  it('rejects missing or incorrect credentials before spawning', async () => {
    for (const auth of [
      {} as Record<string, string>,
      { 'x-parallax-runtime-key': 'wrong' },
    ]) {
      expect(
        (await fetch(`${base}/api/agents`, { method: 'POST', headers: auth }))
          .status
      ).toBe(401);
    }
    expect(runtime.spawn).not.toHaveBeenCalled();
    expect((await fetch(`${base}/api/agents`, { headers })).status).toBe(200);
  });

  it('authenticates WebSocket upgrades before opening a stream', async () => {
    for (const path of ['/ws', '/ws/events', '/ws/agents/agent-1/terminal']) {
      const ws = new WebSocket(base.replace('http', 'ws') + path);
      const result = await new Promise<number>((resolve, reject) => {
        ws.on('unexpected-response', (_req, response) => {
          response.resume();
          ws.terminate();
          resolve(response.statusCode!);
        });
        ws.on('error', () => {});
        ws.on('open', () => {
          ws.close();
          reject(new Error('unauthenticated socket opened'));
        });
      });
      expect(result).toBe(401);
    }
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { headers });
    await once(ws, 'open');
    const closed = once(ws, 'close');
    ws.close();
    await closed;
  });

  it('exposes truthful capabilities before thread allocation', async () => {
    const response = await fetch(`${base}/api/capabilities`, { headers });
    expect(await response.json()).toEqual({
      agents: true,
      threads: true,
      threadEvents: true,
      executionCleanup: true,
    });
  });

  it('implements idempotent execution resource cleanup and returns failures', async () => {
    const path = `${base}/api/executions/exec-1/resources`;
    expect((await fetch(path, { method: 'DELETE', headers })).status).toBe(204);
    expect(runtime.cleanupExecution).toHaveBeenCalledWith('exec-1');
    runtime.cleanupExecution.mockRejectedValue(
      new Error('worker still running')
    );
    expect((await fetch(path, { method: 'DELETE', headers })).status).toBe(500);
  });

  it('fails closed for absent credentials and unsafe development configuration', () => {
    vi.stubEnv('PARALLAX_RUNTIME_API_KEY', '');
    vi.stubEnv('PARALLAX_RUNTIME_AUTH_MODE', 'required');
    expect(() => runtimeSecurity('127.0.0.1')).toThrow(
      'PARALLAX_RUNTIME_API_KEY'
    );
    expect(() =>
      runtimeSecurity('0.0.0.0', { authMode: 'development' })
    ).toThrow('loopback');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() =>
      runtimeSecurity('127.0.0.1', { authMode: 'development' })
    ).toThrow('nonproduction');
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      runtimeSecurity('127.0.0.1', { authMode: 'development' }).authorize({})
    ).toBe(true);
  });

  it('uses the complete execution identity for safe shared resource names', () => {
    expect(executionResourceName('abcdefgh-1')).not.toBe(
      executionResourceName('abcdefgh-2')
    );
    expect(executionResourceName('../../outside')).toMatch(
      /^parallax-auth-[a-f0-9]{40}$/
    );
  });
});
