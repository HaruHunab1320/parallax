---
sidebar_position: 5
title: Thread Handlers
---

# Thread Handlers

SDK 0.4.0 adds thread lifecycle management to `ParallaxAgent`. Subclasses override protected handler methods to spawn and manage CLI agent sessions (via pty-manager, tmux-manager, or any process manager).

## Handler Methods

### handleGatewayThreadSpawn

Called when the control plane sends a `ThreadSpawnRequest`. Override this to spawn a CLI agent thread.

```typescript
protected async handleGatewayThreadSpawn(
  stream: grpc.ClientDuplexStream<any, any>,
  requestId: string,
  request: GatewayThreadSpawnRequest
): Promise<void>
```

The default implementation sends back a failure result (`"Thread spawning not supported by this agent"`). Override to:

1. Parse `preparation_json` and `policy_json`
2. Provision the workspace
3. Start the CLI adapter (e.g. Claude Code, Gemini CLI)
4. Register the thread for cleanup tracking
5. Send back a `ThreadSpawnResult`

```typescript
protected async handleGatewayThreadSpawn(
  stream: grpc.ClientDuplexStream<any, any>,
  requestId: string,
  request: GatewayThreadSpawnRequest
): Promise<void> {
  const preparation = JSON.parse(request.preparation_json || '{}');
  const policy = JSON.parse(request.policy_json || '{}');

  // Spawn the CLI agent
  const session = await this.ptyManager.spawn({
    adapter: request.adapter_type,
    task: request.task,
    workspace: preparation.workspace?.workspacePath,
    approvalPreset: policy.approvalPreset,
  });

  // Track for cleanup
  this.registerThread(request.thread_id, () => session.kill());

  // Forward output as thread events
  let sequence = 0;
  session.onOutput((text) => {
    this.emitThreadEvent({
      thread_id: request.thread_id,
      event_type: 'output',
      data_json: JSON.stringify({ text }),
      timestamp_ms: Date.now(),
      sequence: sequence++,
    });
  });

  // Confirm spawn
  stream.write({
    request_id: requestId,
    thread_spawn_result: {
      thread_id: request.thread_id,
      success: true,
      adapter_type: request.adapter_type,
      workspace_dir: preparation.workspace?.workspacePath,
    },
  });
}
```

### handleGatewayThreadInput

Called when the control plane sends text input to a running thread.

```typescript
protected async handleGatewayThreadInput(
  request: GatewayThreadInput
): Promise<void>
```

Default: no-op. Override to route input to the correct thread session:

```typescript
protected async handleGatewayThreadInput(
  request: GatewayThreadInput
): Promise<void> {
  const session = this.sessions.get(request.thread_id);
  if (session) {
    session.write(request.input);
  }
}
```

### handleGatewayThreadStop

Called when the control plane requests a thread to stop.

```typescript
protected async handleGatewayThreadStop(
  stream: grpc.ClientDuplexStream<any, any>,
  requestId: string,
  request: GatewayThreadStopRequest
): Promise<void>
```

Default: calls cleanup on the tracked thread and sends a `completed` status update. Override for graceful shutdown logic:

```typescript
protected async handleGatewayThreadStop(
  stream: grpc.ClientDuplexStream<any, any>,
  requestId: string,
  request: GatewayThreadStopRequest
): Promise<void> {
  const session = this.sessions.get(request.thread_id);
  if (session) {
    if (request.force) {
      session.kill('SIGKILL');
    } else {
      session.write('/exit\n');
      await session.waitForExit(5000);
    }
  }

  this.unregisterThread(request.thread_id);

  stream.write({
    request_id: requestId,
    thread_status_update: {
      thread_id: request.thread_id,
      status: 'completed',
      summary: `Stopped: ${request.reason}`,
      progress: 1.0,
      timestamp_ms: Date.now(),
    },
  });
}
```

## Helper Methods

### emitThreadEvent

Stream a thread lifecycle event back to the control plane.

```typescript
protected emitThreadEvent(event: GatewayThreadEvent): void
```

Writes a `ThreadEventReport` message to the gateway stream. Safe to call even if the stream is closed (silently no-ops).

```typescript
this.emitThreadEvent({
  thread_id: 'thread-abc',
  event_type: 'output',
  data_json: JSON.stringify({ text: 'Building project...' }),
  timestamp_ms: Date.now(),
  sequence: 42,
});
```

### emitThreadStatusUpdate

Send a periodic status/summary update for a thread.

```typescript
protected emitThreadStatusUpdate(update: GatewayThreadStatusUpdate): void
```

```typescript
this.emitThreadStatusUpdate({
  thread_id: 'thread-abc',
  status: 'running',
  summary: 'Implementing authentication module',
  progress: 0.6,
  timestamp_ms: Date.now(),
});
```

### registerThread / unregisterThread

Track active threads for automatic cleanup on disconnect or shutdown.

```typescript
protected registerThread(threadId: string, cleanup: () => void): void
protected unregisterThread(threadId: string): void
```

When the gateway stream disconnects or `shutdown()` is called, the SDK automatically calls each registered thread's cleanup function. Use `unregisterThread` when a thread completes naturally.

## Thread Types

All thread-related types are exported from `@parallaxai/sdk-typescript`:

```typescript
import type {
  GatewayThreadSpawnRequest,
  GatewayThreadSpawnResult,
  GatewayThreadEvent,
  GatewayThreadInput,
  GatewayThreadStopRequest,
  GatewayThreadStatusUpdate,
} from '@parallaxai/sdk-typescript';
```

## Cleanup Behavior

On gateway disconnect or agent shutdown:

1. All registered threads have their cleanup functions called
2. Heartbeat timer is cleared
3. Gateway stream is closed
4. If `autoReconnect` is enabled, the SDK begins reconnection with exponential backoff

This ensures no orphaned CLI agent processes are left running when the connection drops.
