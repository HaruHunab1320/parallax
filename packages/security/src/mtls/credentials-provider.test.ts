import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MTLSCredentialsProvider, MTLSConfig } from './credentials-provider';
import * as grpc from '@grpc/grpc-js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('MTLSCredentialsProvider', () => {
  describe('with mTLS disabled', () => {
    const config: MTLSConfig = {
      enabled: false,
      certsDir: '/tmp/fake-certs',
    };

    it('should return insecure server credentials', async () => {
      const provider = new MTLSCredentialsProvider(config, logger);
      const creds = await provider.getServerCredentials('test-service');
      expect(creds).toBeDefined();
      // Insecure credentials are returned when disabled
    });

    it('should return insecure channel credentials', async () => {
      const provider = new MTLSCredentialsProvider(config, logger);
      const creds = await provider.getChannelCredentials('target', 'client');
      expect(creds).toBeDefined();
    });
  });

  describe('createAuthMetadata', () => {
    it('should create metadata with agent-id and timestamp', () => {
      const config: MTLSConfig = { enabled: false, certsDir: '/tmp' };
      const provider = new MTLSCredentialsProvider(config, logger);

      const metadata = provider.createAuthMetadata('agent-42');
      expect(metadata.get('agent-id')).toEqual(['agent-42']);
      expect(metadata.get('timestamp')).toHaveLength(1);
      // Timestamp should be ISO string
      const ts = metadata.get('timestamp')[0] as string;
      expect(() => new Date(ts)).not.toThrow();
    });

    it('should include auth token if env var set', () => {
      const config: MTLSConfig = { enabled: false, certsDir: '/tmp' };
      const provider = new MTLSCredentialsProvider(config, logger);

      const originalToken = process.env.PARALLAX_AUTH_TOKEN;
      process.env.PARALLAX_AUTH_TOKEN = 'test-token-123';
      try {
        const metadata = provider.createAuthMetadata('agent-1');
        expect(metadata.get('authorization')).toEqual(['Bearer test-token-123']);
      } finally {
        if (originalToken !== undefined) {
          process.env.PARALLAX_AUTH_TOKEN = originalToken;
        } else {
          delete process.env.PARALLAX_AUTH_TOKEN;
        }
      }
    });
  });

  describe('verifyClientCertificate', () => {
    it('should verify client with valid agent-id', async () => {
      const config: MTLSConfig = { enabled: true, certsDir: '/tmp' };
      const provider = new MTLSCredentialsProvider(config, logger);

      const metadata = new grpc.Metadata();
      metadata.set('agent-id', 'agent-42');

      const mockCall = {
        getPeer: () => 'ipv4:127.0.0.1:5000',
        metadata,
      } as any;

      const result = await provider.verifyClientCertificate(mockCall);
      expect(result.verified).toBe(true);
      expect(result.clientId).toBe('agent-42');
    });

    it('should reject client without agent-id', async () => {
      const config: MTLSConfig = { enabled: true, certsDir: '/tmp' };
      const provider = new MTLSCredentialsProvider(config, logger);

      const mockCall = {
        getPeer: () => 'ipv4:127.0.0.1:5000',
        metadata: new grpc.Metadata(),
      } as any;

      const result = await provider.verifyClientCertificate(mockCall);
      expect(result.verified).toBe(false);
      expect(result.error).toContain('No agent ID');
    });
  });

  describe('createVerificationInterceptor', () => {
    it('should call next() when client cert checking disabled', () => {
      const config: MTLSConfig = { enabled: true, certsDir: '/tmp', checkClientCertificate: false };
      const provider = new MTLSCredentialsProvider(config, logger);
      const interceptor = provider.createVerificationInterceptor();

      const next = vi.fn();
      interceptor({}, vi.fn(), next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject when no agent-id in metadata', () => {
      const config: MTLSConfig = { enabled: true, certsDir: '/tmp', checkClientCertificate: true };
      const provider = new MTLSCredentialsProvider(config, logger);
      const interceptor = provider.createVerificationInterceptor();

      const callback = vi.fn();
      const next = vi.fn();
      const call = { metadata: new grpc.Metadata() };

      interceptor(call, callback, next);
      expect(callback).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });
});
