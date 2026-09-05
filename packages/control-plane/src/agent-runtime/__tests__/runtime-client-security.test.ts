import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { AgentRuntimeService } from '../agent-runtime-service';
import { RuntimeClient } from '../runtime-client';

const key = 'runtime-client-test-key-0123456789012345';
const logger = pino({ level: 'silent' });

describe('RuntimeClient security and cleanup contract', () => {
  let server: Server;
  let wss: WebSocketServer;
  let client: RuntimeClient;
  let baseUrl: string;
  let requests: Array<{ path: string; key: string | string[] | undefined }>;
  let cleanupStatus: number;
  beforeEach(async () => {
    requests = [];
    cleanupStatus = 204;
    server = createServer((req, res) => {
      requests.push({
        path: req.url!,
        key: req.headers['x-parallax-runtime-key'],
      });
      if (req.headers['x-parallax-runtime-key'] !== key) {
        res.writeHead(401).end();
        return;
      }
      if (req.url?.endsWith('/resources')) {
        res.writeHead(cleanupStatus).end();
        return;
      }
      if (req.url === '/api/capabilities') {
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ threads: false, threadEvents: false }));
        return;
      }
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ healthy: true }));
    });
    wss = new WebSocketServer({ server });
    wss.on('connection', (_ws, req) => {
      requests.push({
        path: req.url!,
        key: req.headers['x-parallax-runtime-key'],
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    client = new RuntimeClient(logger, {
      baseUrl,
      apiKey: key,
      authMode: 'required',
      reconnectInterval: 10,
    });
  });
  afterEach(async () => {
    client.disconnect();
    wss.clients.forEach((ws) => {
      ws.terminate();
    });
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it('authenticates HTTP and WebSocket requests with configured runtime credentials', async () => {
    await client.healthCheck();
    await client.connect();
    expect(requests).toEqual([
      { path: '/api/health', key },
      { path: '/ws', key },
    ]);
  });

  it('loads the service credential from the environment', async () => {
    vi.stubEnv('PARALLAX_RUNTIME_API_KEY', key);
    const fromEnv = new RuntimeClient(logger, {
      baseUrl,
      authMode: 'required',
    });
    await fromEnv.healthCheck();
    expect(requests[0].key).toBe(key);
  });

  it('does not treat a missing cleanup endpoint as successful cleanup', async () => {
    await client.cleanupExecution('exec-1');
    cleanupStatus = 404;
    await expect(client.cleanupExecution('exec-1')).rejects.toMatchObject({
      status: 404,
    });
    cleanupStatus = 500;
    await expect(client.cleanupExecution('exec-1')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('checks capability support before attempting thread creation', async () => {
    await expect(
      client.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Review',
      })
    ).rejects.toThrow('does not support');
    expect(requests.map((request) => request.path)).toEqual([
      '/api/capabilities',
    ]);
  });

  it('does not forward the runtime key to an unrelated WebSocket host', () => {
    expect(
      () =>
        new RuntimeClient(logger, {
          baseUrl,
          wsUrl: 'ws://other.example/ws',
          apiKey: key,
        })
    ).toThrow('share a host');
  });

  it('does not reconnect after an intentional disconnect', async () => {
    await client.connect();
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(requests.filter((request) => request.path === '/ws')).toHaveLength(
      1
    );
  });

  it('reports runtime cleanup failures through the service', async () => {
    const service = new AgentRuntimeService(logger);
    service.registerRuntimeDirect('test', 'local', client);
    cleanupStatus = 500;
    await expect(service.cleanupExecution('exec-1')).rejects.toThrow(
      'Execution resource cleanup failed'
    );
  });
});
