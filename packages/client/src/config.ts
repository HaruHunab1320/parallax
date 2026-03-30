export interface ParallaxClientConfig {
  /** Base URL of the Parallax control plane (e.g. 'http://localhost:8081') */
  baseUrl: string;

  /** API key for authentication (plx_xxxxx format) */
  apiKey?: string;

  /** JWT auth tokens */
  auth?: {
    accessToken: string;
    refreshToken?: string;
  };

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Number of retries on transient failures (default: 2) */
  retries?: number;

  /** Callback when tokens are refreshed via refresh token flow */
  onTokenRefresh?: (tokens: {
    accessToken: string;
    refreshToken: string;
  }) => void;

  /** Custom headers to include in every request */
  headers?: Record<string, string>;
}

export const DEFAULT_CONFIG = {
  timeout: 30000,
  retries: 2,
} as const;

export function validateConfig(config: ParallaxClientConfig): void {
  if (!config.baseUrl) {
    throw new Error('ParallaxClient requires a baseUrl');
  }

  // Strip trailing slash
  if (config.baseUrl.endsWith('/')) {
    config.baseUrl = config.baseUrl.slice(0, -1);
  }

  if (!config.apiKey && !config.auth) {
    // Allow no-auth mode for OSS deployments without multi_user
  }

  if (config.apiKey && config.auth) {
    throw new Error('Specify either apiKey or auth, not both');
  }
}
