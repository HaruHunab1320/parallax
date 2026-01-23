# Raven Docs Integration

## Overview

This document describes what Parallax needs to add for Raven Docs integration.

**TL;DR: Add webhook callbacks to the control plane. That's it.**

## What Parallax Already Has

The control plane is feature-complete for external integration:

| Feature | Status | Endpoint |
|---------|--------|----------|
| Pattern execution (sync) | Done | `POST /api/patterns/:name/execute` |
| Pattern execution (async) | Done | `POST /api/executions` |
| Execution status | Done | `GET /api/executions/:id` |
| Execution streaming | Done | `WebSocket /api/executions/:id/stream` |
| Agent registration | Done | gRPC `Registry.Register` |
| Agent listing | Done | `GET /api/agents` |
| Pattern listing | Done | `GET /api/patterns` |

Raven Docs can already:
1. Call `POST /api/executions` to trigger a pattern
2. Poll `GET /api/executions/:id` or use WebSocket streaming for results

## What's Missing: Webhooks

Currently, external systems must poll or maintain a WebSocket connection. For fire-and-forget integration, we need **outbound webhooks**.

### Integration Flow with Webhooks

```
Raven Docs                              Parallax
    │                                       │
    │  POST /api/executions                 │
    │  {                                    │
    │    "patternName": "DocumentAnalysis", │
    │    "input": { "document": "..." },    │
    │    "webhookUrl": "https://raven.app/api/parallax/callback",
    │    "webhookSecret": "shared-secret"   │
    │  }                                    │
    │──────────────────────────────────────>│
    │                                       │
    │  { "executionId": "abc-123" }         │
    │<──────────────────────────────────────│
    │                                       │
    │         ... pattern executes ...      │
    │                                       │
    │  POST https://raven.app/api/parallax/callback
    │  X-Parallax-Signature: sha256=...     │
    │  {                                    │
    │    "executionId": "abc-123",          │
    │    "status": "completed",             │
    │    "result": { ... },                 │
    │    "confidence": 0.92,                │
    │    "duration": 4521                   │
    │  }                                    │
    │<──────────────────────────────────────│
```

## Implementation

### 1. Update Execution Request Type

```typescript
// packages/control-plane/src/api/executions.ts

interface CreateExecutionRequest {
  patternName: string;
  input: Record<string, unknown>;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
  // NEW: Webhook configuration
  webhook?: {
    url: string;
    secret?: string;  // For HMAC signature verification
    events?: ('completed' | 'failed' | 'cancelled')[];  // Default: all
  };
}
```

### 2. Add Webhook Service

```typescript
// packages/control-plane/src/webhooks/webhook.service.ts

import { createHmac } from 'crypto';

export interface WebhookPayload {
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
  confidence?: number;
  duration: number;
  completedAt: string;
}

export class WebhookService {
  async send(
    url: string,
    payload: WebhookPayload,
    secret?: string
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Parallax-Event': payload.status,
      'X-Parallax-Execution-Id': payload.executionId,
    };

    // Add HMAC signature if secret provided
    if (secret) {
      const signature = createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      headers['X-Parallax-Signature'] = `sha256=${signature}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      // Log failure, maybe retry
      console.error(`Webhook failed: ${response.status}`);
    }
  }
}
```

### 3. Hook into Execution Completion

```typescript
// packages/control-plane/src/pattern-engine/pattern-engine.ts

// After execution completes, check for webhook
if (execution.webhook?.url) {
  const events = execution.webhook.events || ['completed', 'failed', 'cancelled'];

  if (events.includes(result.status)) {
    await this.webhookService.send(
      execution.webhook.url,
      {
        executionId: execution.id,
        status: result.status,
        result: result.output,
        error: result.error,
        confidence: result.confidence,
        duration: Date.now() - execution.startedAt,
        completedAt: new Date().toISOString(),
      },
      execution.webhook.secret
    );
  }
}
```

### 4. Store Webhook Config in Database

```sql
-- Add to executions table
ALTER TABLE executions ADD COLUMN webhook_url TEXT;
ALTER TABLE executions ADD COLUMN webhook_secret_encrypted TEXT;
ALTER TABLE executions ADD COLUMN webhook_events TEXT[];
```

### 5. Update SDKs (Trivial)

Each SDK just needs to accept and pass through the webhook parameter:

**TypeScript:**
```typescript
await client.execute('PatternName', input, {
  webhook: {
    url: 'https://my-server.com/callback',
    secret: 'my-secret'
  }
});
```

**Python:**
```python
client.execute('PatternName', input, webhook={
    'url': 'https://my-server.com/callback',
    'secret': 'my-secret'
})
```

**Rust:**
```rust
client.execute("PatternName", input, ExecuteOptions {
    webhook: Some(WebhookConfig {
        url: "https://my-server.com/callback".into(),
        secret: Some("my-secret".into()),
    }),
    ..Default::default()
});
```

## Retry Logic (Optional Enhancement)

For reliability, add exponential backoff retries:

```typescript
async sendWithRetry(
  url: string,
  payload: WebhookPayload,
  secret?: string,
  maxRetries = 3
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await this.send(url, payload, secret);
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
    }
  }
}
```

## Implementation Checklist

- [ ] Add `webhook` field to execution request schema
- [ ] Create `WebhookService` with HMAC signing
- [ ] Store webhook config in executions table
- [ ] Call webhook on execution completion
- [ ] Add retry logic for failed webhooks
- [ ] Update TypeScript SDK
- [ ] Update Python SDK
- [ ] Update Rust SDK
- [ ] Add webhook delivery logging/metrics

## Security Considerations

1. **HMAC Signatures**: Always use `webhookSecret` to verify payloads
2. **HTTPS Only**: Reject non-HTTPS webhook URLs in production
3. **Timeout**: Set reasonable timeout (10s) for webhook calls
4. **No Secrets in Payload**: Never include API keys or secrets in webhook body
