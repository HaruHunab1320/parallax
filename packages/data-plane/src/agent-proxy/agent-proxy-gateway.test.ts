import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';

// Mock proto-loader and grpc
vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({})),
}));

vi.mock('@grpc/grpc-js', () => ({
  loadPackageDefinition: vi.fn(() => ({
    parallax: {
      confidence: {
        ConfidenceAgent: vi.fn(() => ({
          healthCheck: vi.fn((_req: any, cb: any) => cb(null, { status: 'HEALTHY' })),
          analyze: vi.fn(),
        })),
      },
    },
  })),
  credentials: {
    createInsecure: vi.fn(),
  },
}));

import { AgentProxy, GatewayDispatcher } from './agent-proxy';
import type { ProxyConfig } from './types';

const logger = pino({ level: 'silent' });

const defaultConfig: ProxyConfig = {
  timeout: 5000,
  retries: 0,
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 10000,
    monitoringPeriod: 30000,
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000,
  },
};

describe('AgentProxy gateway protocol', () => {
  let proxy: AgentProxy;

  beforeEach(() => {
    proxy = new AgentProxy(defaultConfig, logger);
  });

  describe('registerAgent', () => {
    it('auto-detects gateway protocol from gateway:// endpoint', async () => {
      await proxy.registerAgent('gw-agent', 'gateway://gw-agent');

      // The agent should be connected without a health check (gateway agents skip it)
      const metrics = proxy.getAgentMetrics('gw-agent');
      expect(metrics).not.toBeNull();
      expect(metrics!.requestCount).toBe(0);
    });

    it('gateway agents are immediately marked connected without health check', async () => {
      const connectedHandler = vi.fn();
      proxy.on('agent-connected', connectedHandler);

      await proxy.registerAgent('gw-agent', 'gateway://gw-agent');

      expect(connectedHandler).toHaveBeenCalledWith('gw-agent');
    });
  });

  describe('setGatewayDispatcher', () => {
    it('dispatcher is called for gateway agents with correct args', async () => {
      const dispatcher: GatewayDispatcher = vi.fn().mockResolvedValue({
        value: { analyzed: true },
        confidence: 0.9,
      });

      proxy.setGatewayDispatcher(dispatcher);
      await proxy.registerAgent('gw-agent', 'gateway://gw-agent');

      const response = await proxy.request({
        agentId: 'gw-agent',
        method: 'analyze',
        payload: { task: 'test task', data: { x: 1 } },
      });

      expect(dispatcher).toHaveBeenCalledWith(
        'gw-agent',
        expect.objectContaining({ description: 'test task' }),
        expect.any(Number)
      );
      expect(response.data).toEqual({ value: { analyzed: true }, confidence: 0.9 });
    });

    it('throws error when no dispatcher set for gateway request', async () => {
      await proxy.registerAgent('gw-agent', 'gateway://gw-agent');

      await expect(
        proxy.request({
          agentId: 'gw-agent',
          method: 'analyze',
          payload: { task: 'test' },
        })
      ).rejects.toThrow('No gateway dispatcher configured');
    });
  });
});
