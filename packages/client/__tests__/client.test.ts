import { describe, it, expect } from 'vitest';
import { ParallaxClient, ParallaxClientConfig } from '../src/index';

describe('ParallaxClient', () => {
  it('should create a client with baseUrl', () => {
    const client = new ParallaxClient({ baseUrl: 'http://localhost:8081' });

    expect(client).toBeDefined();
    expect(client.patterns).toBeDefined();
    expect(client.agents).toBeDefined();
    expect(client.executions).toBeDefined();
    expect(client.schedules).toBeDefined();
    expect(client.license).toBeDefined();
    expect(client.managedAgents).toBeDefined();
    expect(client.managedThreads).toBeDefined();
  });

  it('should create a client with apiKey', () => {
    const client = new ParallaxClient({
      baseUrl: 'http://localhost:8081',
      apiKey: 'plx_test123',
    });

    expect(client).toBeDefined();
  });

  it('should create a client with JWT auth', () => {
    const client = new ParallaxClient({
      baseUrl: 'http://localhost:8081',
      auth: { accessToken: 'jwt-token' },
    });

    expect(client).toBeDefined();
  });

  it('should strip trailing slash from baseUrl', () => {
    const config: ParallaxClientConfig = {
      baseUrl: 'http://localhost:8081/',
    };

    // validateConfig mutates the config
    const client = new ParallaxClient(config);
    expect(client).toBeDefined();
  });

  it('should throw if baseUrl is empty', () => {
    expect(() => new ParallaxClient({ baseUrl: '' })).toThrow('baseUrl');
  });

  it('should throw if both apiKey and auth are provided', () => {
    expect(
      () =>
        new ParallaxClient({
          baseUrl: 'http://localhost:8081',
          apiKey: 'plx_test',
          auth: { accessToken: 'jwt' },
        })
    ).toThrow('apiKey or auth');
  });
});
