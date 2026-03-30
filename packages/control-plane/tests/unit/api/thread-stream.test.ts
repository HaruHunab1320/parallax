import { EventEmitter } from 'node:events';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExecutionsRouter } from '@/api/executions';
import { ExecutionEventBus } from '@/execution-events';
import type { PatternEngine } from '@/pattern-engine';

// ── Helpers ──

const logger = pino({ level: 'silent' });

function createMockPatternEngine(): PatternEngine {
  return {
    executePattern: vi.fn(),
    getPattern: vi.fn(),
    listPatterns: vi.fn().mockReturnValue([]),
    registerPattern: vi.fn(),
    cancelExecution: vi.fn(),
  } as any;
}

/**
 * Simulate an HTTP request/response to an Express route handler.
 * Extracts the registered handler from the router and calls it directly.
 */
function createMockReqRes(
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) {
  const chunks: string[] = [];
  let headWritten = false;
  let ended = false;

  const req: any = new EventEmitter();
  req.params = params;
  req.query = query;

  const res: any = {
    writeHead: vi.fn(() => {
      headWritten = true;
    }),
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
    }),
    end: vi.fn(() => {
      ended = true;
    }),
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  };

  return {
    req,
    res,
    chunks,
    get headWritten() {
      return headWritten;
    },
    get ended() {
      return ended;
    },
    getEvents(): Array<{ event: string; data: any }> {
      const events: Array<{ event: string; data: any }> = [];
      for (const chunk of chunks) {
        // Parse SSE format: "event: <type>\ndata: <json>\n\n"
        const eventMatch = chunk.match(/^event: (.+)\n/);
        const dataMatch = chunk.match(/data: (.+)\n/);
        if (eventMatch && dataMatch) {
          try {
            events.push({
              event: eventMatch[1],
              data: JSON.parse(dataMatch[1]),
            });
          } catch {
            events.push({ event: eventMatch[1], data: dataMatch[1] });
          }
        }
      }
      return events;
    },
  };
}

/**
 * Extract route handler from Express router by path pattern.
 */
function getRouteHandler(
  router: any,
  method: string,
  pathPattern: string
): Function | null {
  for (const layer of router.stack) {
    if (layer.route) {
      const route = layer.route;
      const routePath = route.path;
      if (routePath === pathPattern && route.methods[method]) {
        return route.stack[0].handle;
      }
    }
  }
  return null;
}

describe('Thread Stream SSE Endpoint', () => {
  let executionEvents: ExecutionEventBus;
  let router: any;

  beforeEach(() => {
    executionEvents = new ExecutionEventBus();
    router = createExecutionsRouter(
      createMockPatternEngine(),
      logger,
      undefined,
      executionEvents
    );
  });

  it('registers the /:id/threads/stream GET route', () => {
    const handler = getRouteHandler(router, 'get', '/:id/threads/stream');
    expect(handler).toBeDefined();
  });

  it('sends connected event on connection', async () => {
    const handler = getRouteHandler(router, 'get', '/:id/threads/stream');
    const { req, res, getEvents } = createMockReqRes({ id: 'exec-1' });

    await handler!(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
      })
    );

    const events = getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('connected');
    expect(events[0].data.executionId).toBe('exec-1');
  });

  it('forwards gateway_thread_* events as SSE', async () => {
    const handler = getRouteHandler(router, 'get', '/:id/threads/stream');
    const { req, res, chunks } = createMockReqRes({ id: 'exec-1' });

    await handler!(req, res);

    // Emit a thread event via the event bus
    executionEvents.emitEvent({
      executionId: 'thread-abc',
      type: 'gateway_thread_output',
      data: {
        thread_id: 'thread-abc',
        event_type: 'output',
        data_json: '{"text":"hello world"}',
        timestamp_ms: 1234,
      },
      timestamp: new Date('2026-01-01T00:00:00Z'),
    });

    // Should have connected + the thread event
    const threadChunks = chunks.filter((c) => c.includes('thread_output'));
    expect(threadChunks).toHaveLength(1);
    expect(threadChunks[0]).toContain('event: thread_output');
    expect(threadChunks[0]).toContain('thread-abc');
  });

  it('filters by threadIds query param', async () => {
    const handler = getRouteHandler(router, 'get', '/:id/threads/stream');
    const { req, res, chunks } = createMockReqRes(
      { id: 'exec-1' },
      { threadIds: 'thread-a,thread-b' }
    );

    await handler!(req, res);

    // Event for thread-a (included)
    executionEvents.emitEvent({
      executionId: 'thread-a',
      type: 'gateway_thread_output',
      data: { thread_id: 'thread-a', event_type: 'output' },
      timestamp: new Date(),
    });

    // Event for thread-c (excluded)
    executionEvents.emitEvent({
      executionId: 'thread-c',
      type: 'gateway_thread_output',
      data: { thread_id: 'thread-c', event_type: 'output' },
      timestamp: new Date(),
    });

    // Event for thread-b (included)
    executionEvents.emitEvent({
      executionId: 'thread-b',
      type: 'gateway_thread_status',
      data: { thread_id: 'thread-b', status: 'running' },
      timestamp: new Date(),
    });

    const threadChunks = chunks.filter((c) => c.includes('event: thread_'));
    expect(threadChunks).toHaveLength(2);
    expect(threadChunks[0]).toContain('thread-a');
    expect(threadChunks[1]).toContain('thread-b');
  });

  it('ignores non-gateway-thread events', async () => {
    const handler = getRouteHandler(router, 'get', '/:id/threads/stream');
    const { req, res, chunks } = createMockReqRes({ id: 'exec-1' });

    await handler!(req, res);

    // Non-thread event
    executionEvents.emitEvent({
      executionId: 'exec-1',
      type: 'step_completed',
      data: { step: 0 },
      timestamp: new Date(),
    });

    const threadChunks = chunks.filter((c) => c.includes('event: thread_'));
    expect(threadChunks).toHaveLength(0);
  });

  it('cleans up event subscription on client disconnect', async () => {
    const handler = getRouteHandler(router, 'get', '/:id/threads/stream');
    const { req, res, chunks } = createMockReqRes({ id: 'exec-1' });

    await handler!(req, res);

    // Simulate client disconnect
    req.emit('close');

    // Events after disconnect should not appear
    executionEvents.emitEvent({
      executionId: 'thread-1',
      type: 'gateway_thread_output',
      data: { thread_id: 'thread-1', event_type: 'output' },
      timestamp: new Date(),
    });

    const threadChunks = chunks.filter((c) => c.includes('event: thread_'));
    expect(threadChunks).toHaveLength(0);
  });
});
