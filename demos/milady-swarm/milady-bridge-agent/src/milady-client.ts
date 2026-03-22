import pino from 'pino';
import type { MiladyChatRequest, MiladyChatResponse } from './types';

const logger = pino({ name: 'milady-client' });

export class MiladyClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, apiToken: string, timeoutMs: number = 30000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiToken = apiToken;
    this.timeoutMs = timeoutMs;
  }

  async chat(text: string): Promise<MiladyChatResponse> {
    const body: MiladyChatRequest = { text };
    const url = `${this.baseUrl}/api/chat`;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 503) {
          logger.warn({ attempt }, 'Milady returned 503, retrying...');
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Milady API error: ${response.status} ${response.statusText}`
          );
        }

        return (await response.json()) as MiladyChatResponse;
      } catch (error: any) {
        lastError = error;
        if (error.name === 'AbortError') {
          throw new Error(`Milady API timed out after ${this.timeoutMs}ms`);
        }
        if (attempt < 2) {
          logger.warn({ attempt, error: error.message }, 'Retrying...');
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('Milady API request failed after retries');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.status === 204 || response.ok;
    } catch {
      return false;
    }
  }
}
