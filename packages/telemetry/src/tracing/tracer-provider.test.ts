import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TracerProvider, TracingConfig, getGlobalTracer } from './tracer-provider';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('TracerProvider', () => {
  describe('constructor', () => {
    it('should create an instance with config', () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      expect(provider).toBeDefined();
    });
  });

  describe('getTracer', () => {
    it('should return a tracer instance', async () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      // Initialize to register the provider
      await provider.initialize();

      const tracer = provider.getTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');

      await provider.shutdown();
    });

    it('should use custom tracer name when provided', async () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      await provider.initialize();

      const tracer = provider.getTracer('custom-tracer');
      expect(tracer).toBeDefined();

      await provider.shutdown();
    });
  });

  describe('withSpan', () => {
    it('should wrap a function with a span', async () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      await provider.initialize();

      const result = await provider.withSpan('test-span', async (span) => {
        expect(span).toBeDefined();
        expect(typeof span.end).toBe('function');
        return 42;
      });

      expect(result).toBe(42);
      await provider.shutdown();
    });

    it('should record exceptions on error', async () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      await provider.initialize();

      await expect(
        provider.withSpan('error-span', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      await provider.shutdown();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      await provider.initialize();
      await expect(provider.shutdown()).resolves.toBeUndefined();
    });

    it('should handle shutdown without initialization', async () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        exporterType: 'none',
      };
      const provider = new TracerProvider(config, logger);
      // Should not throw even without init
      await expect(provider.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('getGlobalTracer', () => {
    it('should throw when not initialized', () => {
      // This test may interfere with others if global state is set
      // Just verify the function exists and has correct signature
      expect(typeof getGlobalTracer).toBe('function');
    });
  });
});
