import { createHmac } from 'crypto';
import { Logger } from 'pino';

export interface WebhookConfig {
  url: string;
  secret?: string;
  events?: ('completed' | 'failed' | 'cancelled')[];
}

export interface WebhookPayload {
  executionId: string;
  patternName: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
  confidence?: number;
  duration: number;
  completedAt: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
}

export class WebhookService {
  private readonly maxRetries = 3;
  private readonly timeoutMs = 10000;

  constructor(private logger: Logger) {}

  /**
   * Send a webhook with automatic retries
   */
  async send(
    config: WebhookConfig,
    payload: WebhookPayload
  ): Promise<WebhookDeliveryResult> {
    const events = config.events || ['completed', 'failed', 'cancelled'];

    // Check if this event type should trigger the webhook
    if (!events.includes(payload.status)) {
      this.logger.debug(
        { executionId: payload.executionId, status: payload.status, events },
        'Webhook skipped - event type not in subscription'
      );
      return { success: true, attempts: 0 };
    }

    return this.sendWithRetry(config.url, payload, config.secret);
  }

  private async sendWithRetry(
    url: string,
    payload: WebhookPayload,
    secret?: string
  ): Promise<WebhookDeliveryResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.sendOnce(url, payload, secret);

        if (result.success) {
          this.logger.info(
            {
              executionId: payload.executionId,
              url,
              statusCode: result.statusCode,
              attempt
            },
            'Webhook delivered successfully'
          );
          return { ...result, attempts: attempt };
        }

        lastError = result.error;
        this.logger.warn(
          {
            executionId: payload.executionId,
            url,
            statusCode: result.statusCode,
            attempt,
            error: result.error
          },
          'Webhook delivery failed, will retry'
        );
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          { executionId: payload.executionId, url, attempt, error: lastError },
          'Webhook delivery error, will retry'
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < this.maxRetries) {
        await this.sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }

    this.logger.error(
      { executionId: payload.executionId, url, error: lastError },
      'Webhook delivery failed after all retries'
    );

    return {
      success: false,
      error: lastError,
      attempts: this.maxRetries
    };
  }

  private async sendOnce(
    url: string,
    payload: WebhookPayload,
    secret?: string
  ): Promise<WebhookDeliveryResult> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Parallax-Webhook/1.0',
      'X-Parallax-Event': payload.status,
      'X-Parallax-Execution-Id': payload.executionId,
      'X-Parallax-Delivery': crypto.randomUUID(),
    };

    // Add HMAC signature if secret provided
    if (secret) {
      const signature = createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      headers['X-Parallax-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, statusCode: response.status, attempts: 1 };
      }

      // Non-2xx response
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        attempts: 1
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Timeout after ${this.timeoutMs}ms`,
          attempts: 1
        };
      }

      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Verify a webhook signature (for receiving webhooks)
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  }
}
