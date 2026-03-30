import { DEFAULT_CONFIG, type ParallaxClientConfig } from './config.js';
import {
  ParallaxError,
  ParallaxNetworkError,
  ParallaxTimeoutError,
} from './error.js';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

export class HttpClient {
  private config: ParallaxClientConfig;
  private accessToken?: string;

  constructor(config: ParallaxClientConfig) {
    this.config = config;
    this.accessToken = config.auth?.accessToken;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const timeout =
      options.timeout ?? this.config.timeout ?? DEFAULT_CONFIG.timeout;
    const maxRetries = this.config.retries ?? DEFAULT_CONFIG.retries;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(
          url,
          {
            method: options.method,
            headers: this.buildHeaders(options.body !== undefined),
            body:
              options.body !== undefined
                ? JSON.stringify(options.body)
                : undefined,
          },
          timeout
        );

        if (response.status === 204) {
          return undefined as T;
        }

        const body = await response.json().catch(() => undefined);

        if (!response.ok) {
          const error = this.parseError(response.status, body);

          // Don't retry on client errors (except 429)
          if (response.status < 500 && response.status !== 429) {
            throw error;
          }

          lastError = error;
          continue;
        }

        return body as T;
      } catch (error) {
        if (
          error instanceof ParallaxError &&
          error.status < 500 &&
          error.status !== 429
        ) {
          throw error;
        }
        lastError = error as Error;

        if (attempt < maxRetries) {
          await this.delay(Math.min(1000 * 2 ** attempt, 5000));
        }
      }
    }

    throw lastError ?? new ParallaxNetworkError('Request failed after retries');
  }

  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: 'GET', path, query });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', path, body });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body });
  }

  async delete<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: 'DELETE', path, query });
  }

  /** Update auth tokens (e.g. after login or token refresh) */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /** Build a full URL for SSE/streaming endpoints */
  buildStreamUrl(path: string): string {
    return `${this.config.baseUrl}${path}`;
  }

  /** Get auth headers for use with raw fetch (e.g. SSE streams) */
  getAuthHeaders(): Record<string, string> {
    return this.buildHeaders(false);
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.config.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private buildHeaders(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    // Auth
    if (this.config.apiKey) {
      headers.Authorization = this.config.apiKey.startsWith('plx_')
        ? this.config.apiKey
        : `ApiKey ${this.config.apiKey}`;
    } else if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    // Custom headers
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ParallaxTimeoutError(timeoutMs);
      }
      throw new ParallaxNetworkError(
        error instanceof Error ? error.message : 'Network request failed'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parseError(status: number, body: unknown): ParallaxError {
    const parsed = body as Record<string, unknown> | undefined;
    const message =
      (parsed?.error as string) ??
      (parsed?.message as string) ??
      `HTTP ${status}`;
    const code = (parsed?.code as string) ?? `HTTP_${status}`;
    const upgradeUrl = parsed?.upgradeUrl as string | undefined;

    return new ParallaxError(message, status, code, body, upgradeUrl);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
