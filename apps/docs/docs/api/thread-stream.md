---
sidebar_position: 3
title: Thread Stream (SSE)
---

# Thread Stream (SSE)

Server-Sent Events endpoint for streaming real-time thread output and lifecycle events from an execution.

## Endpoint

```
GET /api/executions/:id/threads/stream
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `threadIds` | string | Comma-separated list of thread IDs to filter. If omitted, all threads are streamed. |

### Headers

```http
GET /api/executions/exec-123/threads/stream?threadIds=architect,engineer_a HTTP/1.1
Accept: text/event-stream
```

### Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

## Event Format

Events follow the [SSE specification](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events):

```
event: <event-type>
data: <json-payload>

```

### Connection Event

Sent immediately on connection:

```
event: connected
data: {"executionId":"exec-123","threadIds":["architect","engineer_a"]}
```

### Thread Events

Thread events from the gateway are forwarded with the `gateway_thread_` prefix stripped:

| SSE Event | Source | Description |
|-----------|--------|-------------|
| `thread_output` | `gateway_thread_output` | Terminal output from the CLI agent |
| `thread_blocked` | `gateway_thread_blocked` | Agent waiting for input/approval |
| `thread_started` | `gateway_thread_started` | Thread session started |
| `thread_completed` | `gateway_thread_completed` | Thread finished successfully |
| `thread_failed` | `gateway_thread_failed` | Thread encountered an error |
| `thread_turn_complete` | `gateway_thread_turn_complete` | Conversation turn completed |
| `thread_status` | `gateway_thread_status` | Status/summary update |
| `thread_tool_running` | `gateway_thread_tool_running` | Agent executing a tool |

### Event Payload

```json
{
  "executionId": "exec-123",
  "threadId": "architect",
  "type": "gateway_thread_output",
  "data": {
    "thread_id": "architect",
    "event_type": "output",
    "data_json": "{\"text\":\"Building authentication module...\"}",
    "timestamp_ms": 1710700000000,
    "sequence": 42
  },
  "timestamp": "2026-03-17T12:00:00.000Z"
}
```

### Heartbeat

A comment-only heartbeat is sent every 15 seconds to keep the connection alive:

```
: heartbeat

```

## Usage

### curl

```bash
curl -sN 'http://localhost:8080/api/executions/exec-123/threads/stream' \
  | while IFS= read -r line; do
    case "$line" in
      data:*) echo "${line#data: }" | jq . ;;
    esac
  done
```

### JavaScript (EventSource)

```javascript
const es = new EventSource(
  '/api/executions/exec-123/threads/stream?threadIds=architect,engineer_a'
);

es.addEventListener('connected', (e) => {
  console.log('Connected:', JSON.parse(e.data));
});

es.addEventListener('thread_output', (e) => {
  const payload = JSON.parse(e.data);
  const output = JSON.parse(payload.data.data_json);
  console.log(`[${payload.threadId}] ${output.text}`);
});

es.addEventListener('thread_completed', (e) => {
  const payload = JSON.parse(e.data);
  console.log(`Thread ${payload.threadId} completed`);
});

// Close when done
es.close();
```

### React Hook

The web dashboard includes a `useThreadStream` hook:

```typescript
import { useThreadStream } from '@/hooks/useThreadStream';

function ThreadMonitor({ executionId }: { executionId: string }) {
  const { events, connected } = useThreadStream(executionId, {
    threadIds: ['architect', 'engineer_a'],
  });

  return (
    <div>
      <p>Status: {connected ? 'Connected' : 'Disconnected'}</p>
      {events.map((event, i) => (
        <div key={i}>{event.data.data_json}</div>
      ))}
    </div>
  );
}
```

## Filtering

When `threadIds` is provided, only events matching those thread IDs are forwarded. The filter operates on the `thread_id` field inside the event's `data` object.

Without `threadIds`, all `gateway_thread_*` events from the execution event bus are forwarded regardless of which thread produced them.

## Cleanup

The SSE connection is cleaned up when:

- The client disconnects (closes the `EventSource` or HTTP connection)
- The heartbeat timer is cleared
- The event bus subscription is removed

No events are delivered after the client disconnects.
