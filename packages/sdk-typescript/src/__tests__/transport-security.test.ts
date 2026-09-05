import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RegistryService,
  WatchEvent_EventType,
} from '../../generated/registry';
import { ParallaxAgent } from '../agent-base';
import { RegistryServiceClient } from '../registry-client';
import {
  controlPlaneCredentials,
  controlPlaneMetadata,
} from '../transport-security';

afterEach(() => vi.unstubAllEnvs());

describe('control-plane transport security', () => {
  it('preserves explicit metadata without modifying the caller', () => {
    vi.stubEnv('PARALLAX_GRPC_API_KEY', 'environment-key');
    const metadata = new grpc.Metadata();
    metadata.set('trace-id', 'trace');
    const merged = controlPlaneMetadata(metadata);
    expect(merged.get('x-parallax-api-key')).toEqual(['environment-key']);
    expect(metadata.get('x-parallax-api-key')).toEqual([]);
    metadata.set('x-parallax-api-key', 'explicit-key');
    expect(controlPlaneMetadata(metadata).get('x-parallax-api-key')).toEqual([
      'explicit-key',
    ]);
    expect(merged.get('trace-id')).toEqual(['trace']);
  });

  it('rejects malformed TLS instead of opening an insecure channel', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'parallax-sdk-tls-'));
    try {
      const ca = path.join(directory, 'invalid.pem');
      writeFileSync(ca, 'not a certificate');
      vi.stubEnv('PARALLAX_GRPC_TLS_ENABLED', 'true');
      vi.stubEnv('PARALLAX_GRPC_CLIENT_TLS_CA', ca);
      expect(() => controlPlaneCredentials()).toThrow();
      const explicit = grpc.credentials.createInsecure();
      expect(controlPlaneCredentials(explicit)).toBe(explicit);
      vi.stubEnv('PARALLAX_GRPC_TLS_ENABLED', 'false');
      expect(() => controlPlaneCredentials()).toThrow('TLS');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('authenticates real unary, server-streaming, registry, renewal and gateway calls', async () => {
    const key = 'test-service-key-with-at-least-32-characters';
    vi.stubEnv('PARALLAX_GRPC_API_KEY', key);
    vi.stubEnv('PARALLAX_GRPC_TLS_ENABLED', 'false');
    const seen: string[] = [];
    const server = new grpc.Server();
    const authorized = (call: { metadata: grpc.Metadata }) =>
      call.metadata.get('x-parallax-api-key')[0] === key;
    const unary =
      (name: string, response: object) => (call: any, callback: any) => {
        if (!authorized(call))
          return callback({
            code: grpc.status.UNAUTHENTICATED,
            details: 'key required',
          });
        seen.push(name);
        callback(null, response);
      };
    server.addService(RegistryService, {
      listAgents: unary('list', {
        agents: [],
        totalCount: 0,
        nextContinuationToken: '',
      }),
      register: unary('register', {
        success: true,
        leaseId: 'lease',
        message: '',
      }),
      renew: unary('renew', { success: true, leaseId: 'lease', message: '' }),
      unregister: unary('unregister', {
        success: true,
        leaseId: '',
        message: '',
      }),
      watch: (call: any) => {
        if (!authorized(call)) {
          call.destroy({
            code: grpc.status.UNAUTHENTICATED,
            details: 'key required',
          });
          return;
        }
        seen.push('watch');
        call.write({ type: WatchEvent_EventType.ADDED });
        call.end();
      },
    });
    const protoDir = path.resolve(__dirname, '../../../../proto');
    const definition = protoLoader.loadSync(
      path.join(protoDir, 'gateway.proto'),
      { keepCase: true, includeDirs: [protoDir] }
    );
    const gateway = (grpc.loadPackageDefinition(definition) as any).parallax
      .gateway;
    server.addService(gateway.AgentGateway.service, {
      connect: (call: any) => {
        if (!authorized(call)) {
          call.destroy({
            code: grpc.status.UNAUTHENTICATED,
            details: 'key required',
          });
          return;
        }
        seen.push('gateway');
        call.on('data', (message: any) => {
          if (message.hello)
            call.write({ ack: { accepted: true, assigned_node_id: 'test' } });
        });
        call.on('end', () => call.end());
      },
    });
    const port = await new Promise<number>((resolve, reject) =>
      server.bindAsync(
        '127.0.0.1:0',
        grpc.ServerCredentials.createInsecure(),
        (error, value) => (error ? reject(error) : resolve(value))
      )
    );
    const endpoint = `127.0.0.1:${port}`;
    const client = new RegistryServiceClient(endpoint);
    class Agent extends ParallaxAgent {
      async analyze() {
        return { value: 'ok', confidence: 1 };
      }
      async registerForTest() {
        return this.register('127.0.0.1:1', endpoint);
      }
    }
    const agent = new Agent('transport-test', 'Transport test', []);
    try {
      expect((await client.list()).totalCount).toBe(0);
      const denied = new grpc.Metadata();
      denied.set('x-parallax-api-key', 'wrong');
      await expect(client.list([], {}, 100, '', denied)).rejects.toMatchObject({
        code: grpc.status.UNAUTHENTICATED,
      });
      await new Promise<void>((resolve, reject) =>
        client.watch([], true, { onEnd: resolve, onError: reject })
      );
      await agent.registerForTest();
      await (agent as any).renewLease();
      await agent.connectViaGateway(endpoint, { autoReconnect: false });
      await agent.shutdown();
      expect(seen).toEqual([
        'list',
        'watch',
        'register',
        'renew',
        'gateway',
        'unregister',
      ]);
    } finally {
      await agent.shutdown();
      (client as any).client.close();
      (agent as any).registryClient?.close();
      server.forceShutdown();
    }
  }, 15000);
});
