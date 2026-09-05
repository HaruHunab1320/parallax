import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthError, type AuthService } from '../../../src/auth/auth-service';
import {
  buildGrpcServerCredentials,
  createGrpcAuthInterceptor,
} from '../../../src/auth/grpc-security';
import { authorizeExecutionUpgrade } from '../../../src/auth/websocket-auth';

const secret = randomBytes(32).toString('hex');
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const serialize = (value: unknown) => Buffer.from(JSON.stringify(value));
const deserialize = (value: Buffer) => JSON.parse(value.toString());
const definition = {
  unary: {
    path: '/test.Security/Unary',
    requestStream: false,
    responseStream: false,
    requestSerialize: serialize,
    requestDeserialize: deserialize,
    responseSerialize: serialize,
    responseDeserialize: deserialize,
  },
  stream: {
    path: '/test.Security/Stream',
    requestStream: false,
    responseStream: true,
    requestSerialize: serialize,
    requestDeserialize: deserialize,
    responseSerialize: serialize,
    responseDeserialize: deserialize,
  },
};

async function startGrpc() {
  const unary = vi.fn((_call, callback) => callback(null, { ok: true }));
  const stream = vi.fn((call) => {
    call.write({ ok: true });
    call.end();
  });
  const server = new grpc.Server({
    interceptors: [createGrpcAuthInterceptor(secret)],
  });
  server.addService(definition, { unary, stream });
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (error, bound) => (error ? reject(error) : resolve(bound))
    )
  );
  const Client = grpc.makeGenericClientConstructor(definition, 'Security');
  const client = new Client(
    `127.0.0.1:${port}`,
    grpc.credentials.createInsecure()
  ) as any;
  cleanups.push(() => {
    client.close();
    server.forceShutdown();
  });
  return { client, unary, stream };
}
const metadata = (value?: string) => {
  const result = new grpc.Metadata();
  if (value) result.set('x-parallax-api-key', value);
  return result;
};

describe('gRPC identity over the real transport', () => {
  it('rejects unauthenticated unary requests before the handler and accepts the service key', async () => {
    const { client, unary } = await startGrpc();
    const invoke = (key?: string) =>
      new Promise((resolve, reject) =>
        client.unary({}, metadata(key), (error: unknown, result: unknown) =>
          error ? reject(error) : resolve(result)
        )
      );
    await expect(invoke()).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });
    await expect(invoke(randomBytes(32).toString('hex'))).rejects.toMatchObject(
      { code: grpc.status.UNAUTHENTICATED }
    );
    expect(unary).not.toHaveBeenCalled();
    await expect(invoke(secret)).resolves.toEqual({ ok: true });
    expect(unary).toHaveBeenCalledTimes(1);
  });

  it('protects streaming RPCs before dispatch', async () => {
    const { client, stream } = await startGrpc();
    const events: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      const call = client.stream({}, metadata());
      call.on('data', (value: unknown) => events.push(value));
      call.on('error', (error: grpc.ServiceError) => {
        try {
          expect(error.code).toBe(grpc.status.UNAUTHENTICATED);
          resolve();
        } catch (failure) {
          reject(failure);
        }
      });
    });
    expect(events).toEqual([]);
    expect(stream).not.toHaveBeenCalled();
    await new Promise<void>((resolve, reject) => {
      const call = client.stream({}, metadata(secret));
      call.on('data', (value: unknown) => events.push(value));
      call.on('end', resolve);
      call.on('error', reject);
    });
    expect(events).toEqual([{ ok: true }]);
    expect(stream).toHaveBeenCalledTimes(1);
  });
});

describe('WebSocket authentication before upgrade', () => {
  it('requires valid identity and execution read scope over the real upgrade transport', async () => {
    const service = {
      authenticateAccessToken: vi.fn(async (token: string) => {
        if (token !== secret)
          throw new AuthError('Invalid token', 'INVALID_TOKEN');
        return {
          sub: 'viewer',
          role: 'viewer',
          email: 'viewer@example.com',
          type: 'access',
        };
      }),
      authenticateApiKey: vi.fn(async () => ({
        user: { id: 'admin', role: 'admin', email: 'admin@example.com' },
        apiKey: { id: 'key', permissions: ['patterns:read'] },
      })),
    } as unknown as AuthService;
    const server = createServer();
    const wsServer = new WebSocketServer({ noServer: true });
    const accepted = vi.fn();
    server.on('upgrade', async (req, socket, head) => {
      if (await authorizeExecutionUpgrade(req, socket, service))
        wsServer.handleUpgrade(req, socket, head, (ws) => {
          accepted();
          ws.close();
        });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address() as { port: number };
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          wsServer.close();
          server.close(() => resolve());
        })
    );
    const connect = (authorization?: string) =>
      new Promise<number>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${address.port}/api/executions/run/stream`,
          { headers: authorization ? { Authorization: authorization } : {} }
        );
        ws.on('unexpected-response', (_req, response) => {
          response.resume();
          resolve(response.statusCode!);
          ws.terminate();
        });
        ws.on('open', () => resolve(101));
        // Rejection paths intentionally terminate the pending handshake.
        ws.on('error', (error) => {
          if (!String(error).includes('closed before')) reject(error);
        });
      });
    expect(await connect()).toBe(401);
    expect(await connect('Bearer invalid')).toBe(401);
    expect(await connect(`ApiKey plx_${secret}`)).toBe(403);
    expect(accepted).not.toHaveBeenCalled();
    expect(await connect(`Bearer ${secret}`)).toBe(101);
    expect(accepted).toHaveBeenCalledTimes(1);
  });
});

describe('TLS startup fails closed', () => {
  it('rejects missing, unreadable, and invalid credentials instead of returning plaintext credentials', () => {
    expect(() =>
      buildGrpcServerCredentials({ PARALLAX_GRPC_TLS_ENABLED: 'true' })
    ).toThrow('certificate and key');
    expect(() =>
      buildGrpcServerCredentials({
        PARALLAX_GRPC_TLS_ENABLED: 'true',
        PARALLAX_GRPC_TLS_CERT: '/no-such-certificate',
        PARALLAX_GRPC_TLS_KEY: '/no-such-key',
      })
    ).toThrow();
    const directory = mkdtempSync(join(tmpdir(), 'parallax-invalid-tls-'));
    cleanups.push(() => rmSync(directory, { recursive: true }));
    const cert = join(directory, 'cert.pem');
    const key = join(directory, 'key.pem');
    writeFileSync(cert, randomBytes(32).toString('hex'));
    writeFileSync(key, randomBytes(32).toString('hex'));
    expect(() =>
      buildGrpcServerCredentials({
        PARALLAX_GRPC_TLS_ENABLED: 'true',
        PARALLAX_GRPC_TLS_CERT: cert,
        PARALLAX_GRPC_TLS_KEY: key,
      })
    ).toThrow();
    expect(() =>
      buildGrpcServerCredentials({ NODE_ENV: 'production' })
    ).toThrow('TLS is required');
    expect(() =>
      buildGrpcServerCredentials({ PARALLAX_GRPC_TLS_ENABLED: 'tru' })
    ).toThrow('must be true or false');
    expect(() =>
      buildGrpcServerCredentials({ PARALLAX_GRPC_TLS_CERT: cert })
    ).toThrow('TLS is not enabled');
  });
});
