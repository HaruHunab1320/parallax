import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';

// Mock proto-loader and grpc before importing AgentProxy
vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({})),
}));

vi.mock('@grpc/grpc-js', () => ({
  loadPackageDefinition: vi.fn(() => ({
    parallax: {
      confidence: {
        ConfidenceAgent: vi.fn(() => ({
          analyze: vi.fn(),
          streamAnalyze: vi.fn(),
          getCapabilities: vi.fn(),
          healthCheck: vi.fn(),
        })),
      },
    },
  })),
  credentials: {
    createInsecure: vi.fn(),
  },
}));

import { AgentProxy } from '@/grpc/agent-proxy';
import type { GatewayService, GatewayDispatchResult } from '@/grpc/services/gateway-service';

const logger = pino({ level: 'silent' });

function createMockGatewayService(overrides: Partial<GatewayService> = {}): GatewayService {
  return {
    dispatchTask: vi.fn<any>().mockResolvedValue({
      value: { result: 'ok' },
      confidence: 0.85,
      reasoning: 'gateway result',
      metadata: {},
    } satisfies GatewayDispatchResult),
    healthCheck: vi.fn().mockReturnValue(true),
    getCapabilities: vi.fn().mockReturnValue(['cap-a', 'cap-b']),
    isConnected: vi.fn().mockReturnValue(true),
    getConnectedAgentIds: vi.fn().mockReturnValue([]),
    getImplementation: vi.fn(),
    shutdown: vi.fn(),
    ...overrides,
  } as unknown as GatewayService;
}

describe('AgentProxy gateway routing', () => {
  let proxy: AgentProxy;
  let gateway: GatewayService;

  beforeEach(() => {
    proxy = new AgentProxy(logger);
    gateway = createMockGatewayService();
    proxy.setGatewayService(gateway);
  });

  // ── executeTask ──

  describe('executeTask', () => {
    it('routes gateway:// addresses through GatewayService.dispatchTask', async () => {
      const result = await proxy.executeTask('gateway://agent-1', {
        description: 'Analyze this',
        data: { key: 'val' },
      });

      expect(gateway.dispatchTask).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ description: 'Analyze this' }),
        expect.any(Number)
      );
      expect(result.value).toEqual({ result: 'ok' });
      expect(result.confidence).toBe(0.85);
    });

    it('returns error result when gateway service not set', async () => {
      const proxyNoGw = new AgentProxy(logger);
      const result = await proxyNoGw.executeTask('gateway://agent-1', {
        description: 'test',
      });

      expect(result.confidence).toBe(0);
      expect(result.error).toContain('Gateway service not available');
    });
  });

  // ── executeTaskStream ──

  describe('executeTaskStream', () => {
    it('routes gateway:// via gateway and calls onResult', async () => {
      const onResult = vi.fn();
      await proxy.executeTaskStream(
        'gateway://agent-1',
        { description: 'stream test' },
        onResult
      );

      expect(gateway.dispatchTask).toHaveBeenCalled();
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 0.85 })
      );
    });
  });

  // ── healthCheck ──

  describe('healthCheck', () => {
    it('delegates gateway:// to gatewayService.healthCheck', async () => {
      const result = await proxy.healthCheck('gateway://agent-1');

      expect(gateway.healthCheck).toHaveBeenCalledWith('agent-1');
      expect(result).toBe(true);
    });
  });

  // ── getCapabilities ──

  describe('getCapabilities', () => {
    it('delegates gateway:// to gatewayService.getCapabilities', async () => {
      const caps = await proxy.getCapabilities('gateway://agent-1');

      expect(gateway.getCapabilities).toHaveBeenCalledWith('agent-1');
      expect(caps).toEqual(['cap-a', 'cap-b']);
    });
  });

  // ── Regular gRPC ──

  describe('regular gRPC addresses', () => {
    it('uses standard client path for non-gateway addresses', async () => {
      // The gRPC client mock will handle the analyze call
      const grpc = await import('@grpc/grpc-js');
      const mockClient = {
        analyze: vi.fn((_req: any, _opts: any, cb: any) => {
          cb(null, {
            value_json: JSON.stringify({ data: 'grpc-result' }),
            confidence: 0.7,
            reasoning: 'direct',
            metadata: {},
          });
        }),
      };

      // Replace the ConfidenceAgent constructor to return our mock client
      const loadPkgDef = vi.mocked(grpc.loadPackageDefinition);
      loadPkgDef.mockReturnValue({
        parallax: {
          confidence: {
            ConfidenceAgent: vi.fn(() => mockClient),
          },
        },
      } as any);

      // Create a fresh proxy so it picks up the new mock
      const freshProxy = new AgentProxy(logger);
      freshProxy.setGatewayService(gateway);

      const result = await freshProxy.executeTask('localhost:50052', {
        description: 'direct test',
      });

      expect(gateway.dispatchTask).not.toHaveBeenCalled();
      expect(result.value).toEqual({ data: 'grpc-result' });
    });
  });
});
