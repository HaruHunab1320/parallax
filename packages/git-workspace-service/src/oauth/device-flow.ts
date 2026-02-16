/**
 * OAuth Device Code Flow
 *
 * Implements the OAuth 2.0 Device Authorization Grant (RFC 8628)
 * for authenticating CLI/agent applications without browser control.
 *
 * Flow:
 * 1. Request device code from provider
 * 2. Display verification URL and user code to user
 * 3. Poll for authorization while user completes in browser
 * 4. Receive access token on success
 */

import type {
  GitProvider,
  AgentPermissions,
  OAuthToken,
  DeviceCodeResponse,
  AuthPrompt,
  AuthResult,
  AuthPromptEmitter,
} from '../types';

// Response types for GitHub OAuth API
interface DeviceCodeApiResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface TokenApiResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export interface OAuthDeviceFlowConfig {
  /**
   * OAuth Client ID
   */
  clientId: string;

  /**
   * OAuth Client Secret (optional for public clients)
   */
  clientSecret?: string;

  /**
   * Provider (defaults to 'github')
   */
  provider?: GitProvider;

  /**
   * Permissions to request
   */
  permissions?: AgentPermissions;

  /**
   * Auth prompt emitter for user interaction
   */
  promptEmitter?: AuthPromptEmitter;

  /**
   * Timeout in seconds for the auth flow (default: 900 = 15 min)
   */
  timeout?: number;
}

export interface OAuthDeviceFlowLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
  debug(data: Record<string, unknown>, message: string): void;
}

// GitHub OAuth endpoints
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Error codes from device flow
const ERROR_AUTHORIZATION_PENDING = 'authorization_pending';
const ERROR_SLOW_DOWN = 'slow_down';
const ERROR_EXPIRED_TOKEN = 'expired_token';
const ERROR_ACCESS_DENIED = 'access_denied';

/**
 * OAuth Device Code Flow implementation for GitHub
 */
export class OAuthDeviceFlow {
  private readonly clientId: string;
  private readonly clientSecret?: string;
  private readonly provider: GitProvider;
  private readonly permissions: AgentPermissions;
  private readonly promptEmitter?: AuthPromptEmitter;
  private readonly timeout: number;
  private readonly logger?: OAuthDeviceFlowLogger;

  constructor(config: OAuthDeviceFlowConfig, logger?: OAuthDeviceFlowLogger) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.provider = config.provider || 'github';
    this.permissions = config.permissions || {
      repositories: { type: 'all' },
      contents: 'write',
      pullRequests: 'write',
      issues: 'write',
      metadata: 'read',
      canDeleteBranch: true,
      canForcePush: false,
      canDeleteRepository: false,
      canAdminister: false,
    };
    this.promptEmitter = config.promptEmitter;
    this.timeout = config.timeout || 900;
    this.logger = logger;
  }

  /**
   * Start the device code flow and wait for authorization
   */
  async authorize(): Promise<OAuthToken> {
    this.log('info', {}, 'Starting OAuth device code flow');

    // Step 1: Request device code
    const deviceCode = await this.requestDeviceCode();

    // Step 2: Emit auth prompt
    const prompt: AuthPrompt = {
      provider: this.provider,
      verificationUri: deviceCode.verificationUri,
      userCode: deviceCode.userCode,
      expiresIn: deviceCode.expiresIn,
      requestedPermissions: this.permissions,
    };

    if (this.promptEmitter) {
      this.promptEmitter.onAuthRequired(prompt);
    } else {
      // Default: log to console
      this.printAuthPrompt(prompt);
    }

    // Step 3: Poll for authorization
    try {
      const token = await this.pollForToken(deviceCode);

      const result: AuthResult = {
        success: true,
        provider: this.provider,
      };

      if (this.promptEmitter) {
        this.promptEmitter.onAuthComplete(result);
      }

      this.log('info', {}, 'OAuth authorization successful');
      return token;
    } catch (error) {
      const result: AuthResult = {
        success: false,
        provider: this.provider,
        error: error instanceof Error ? error.message : String(error),
      };

      if (this.promptEmitter) {
        this.promptEmitter.onAuthComplete(result);
      }

      throw error;
    }
  }

  /**
   * Request a device code from GitHub
   */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const scope = this.permissionsToScopes(this.permissions);

    this.log('debug', { scope }, 'Requesting device code');

    const response = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        scope,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to request device code: ${response.status} ${text}`);
    }

    const data = (await response.json()) as DeviceCodeApiResponse;

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
    };
  }

  /**
   * Poll for the access token until authorized or timeout
   */
  async pollForToken(deviceCode: DeviceCodeResponse): Promise<OAuthToken> {
    const startTime = Date.now();
    let interval = deviceCode.interval * 1000;
    const expiresAt = startTime + deviceCode.expiresIn * 1000;

    while (Date.now() < expiresAt) {
      // Check overall timeout
      if (Date.now() - startTime > this.timeout * 1000) {
        throw new Error('OAuth flow timed out');
      }

      // Wait before polling
      await this.sleep(interval);

      // Notify about pending status
      const secondsRemaining = Math.ceil((expiresAt - Date.now()) / 1000);
      if (this.promptEmitter?.onAuthPending) {
        this.promptEmitter.onAuthPending(secondsRemaining);
      }

      try {
        const token = await this.exchangeDeviceCode(deviceCode.deviceCode);
        return token;
      } catch (error) {
        if (error instanceof DeviceFlowError) {
          switch (error.code) {
            case ERROR_AUTHORIZATION_PENDING:
              // Still waiting for user, continue polling
              this.log('debug', {}, 'Authorization pending, continuing to poll');
              continue;

            case ERROR_SLOW_DOWN:
              // Increase polling interval
              interval += 5000;
              this.log('debug', { interval }, 'Slowing down polling');
              continue;

            case ERROR_EXPIRED_TOKEN:
              throw new Error('Device code expired. Please try again.');

            case ERROR_ACCESS_DENIED:
              throw new Error('User denied authorization');

            default:
              throw error;
          }
        }
        throw error;
      }
    }

    throw new Error('Device code expired');
  }

  /**
   * Exchange device code for access token
   */
  private async exchangeDeviceCode(deviceCode: string): Promise<OAuthToken> {
    const body: Record<string, string> = {
      client_id: this.clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    };

    if (this.clientSecret) {
      body.client_secret = this.clientSecret;
    }

    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as TokenApiResponse;

    // Check for errors
    if (data.error) {
      throw new DeviceFlowError(data.error, data.error_description);
    }

    // Parse scopes
    const scopes = (data.scope || '').split(/[,\s]+/).filter(Boolean);

    return {
      accessToken: data.access_token!,
      tokenType: data.token_type || 'bearer',
      scopes,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      refreshToken: data.refresh_token,
      provider: this.provider,
      permissions: this.permissions,
      createdAt: new Date(),
    };
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(refreshTokenValue: string): Promise<OAuthToken> {
    this.log('info', {}, 'Refreshing OAuth token');

    const body: Record<string, string> = {
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
    };

    if (this.clientSecret) {
      body.client_secret = this.clientSecret;
    }

    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${text}`);
    }

    const data = (await response.json()) as TokenApiResponse;

    if (data.error) {
      throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
    }

    const scopes = (data.scope || '').split(/[,\s]+/).filter(Boolean);

    return {
      accessToken: data.access_token!,
      tokenType: data.token_type || 'bearer',
      scopes,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      refreshToken: data.refresh_token || refreshTokenValue,
      provider: this.provider,
      permissions: this.permissions,
      createdAt: new Date(),
    };
  }

  /**
   * Convert AgentPermissions to GitHub OAuth scopes
   */
  private permissionsToScopes(permissions: AgentPermissions): string {
    const scopes: string[] = [];

    // Contents (code)
    if (permissions.contents === 'write') {
      scopes.push('repo'); // Full repo access for private repos
    } else if (permissions.contents === 'read') {
      scopes.push('public_repo'); // Only public repos read
    }

    // Pull requests and issues are covered by 'repo'
    // But we can be more specific with these for public repos
    if (permissions.pullRequests !== 'none' && !scopes.includes('repo')) {
      scopes.push('public_repo');
    }

    // User info (to get username)
    scopes.push('read:user');

    // Note: GitHub's classic OAuth scopes are coarse-grained
    // Fine-grained permissions require GitHub Apps or fine-grained PATs
    // For now, we request 'repo' which gives full access but we
    // enforce limits at the service layer

    return scopes.join(' ');
  }

  /**
   * Print auth prompt to console (default behavior)
   */
  private printAuthPrompt(prompt: AuthPrompt): void {
    console.log('\n┌────────────────────────────────────────────────┐');
    console.log('│       GitHub Authorization Required            │');
    console.log('├────────────────────────────────────────────────┤');
    console.log(`│  1. Go to: ${prompt.verificationUri.padEnd(35)}│`);
    console.log(`│  2. Enter code: ${prompt.userCode.padEnd(29)}│`);
    console.log('├────────────────────────────────────────────────┤');
    console.log(`│  ⏳ Waiting for authorization...               │`);
    console.log(`│  Code expires in ${prompt.expiresIn} seconds${' '.repeat(18)}│`);
    console.log('└────────────────────────────────────────────────┘\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    data: Record<string, unknown>,
    message: string
  ): void {
    if (this.logger) {
      this.logger[level](data, message);
    }
  }
}

/**
 * Error class for device flow specific errors
 */
class DeviceFlowError extends Error {
  constructor(
    public readonly code: string,
    public readonly description?: string
  ) {
    super(description || code);
    this.name = 'DeviceFlowError';
  }
}
