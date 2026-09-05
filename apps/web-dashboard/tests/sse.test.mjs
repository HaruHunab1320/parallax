import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeServerEvents } from '../src/lib/sse.ts';

test('SSE parses fragmented UTF-8, CRLF, named and multiline events', async () => {
  const bytes = new TextEncoder().encode(': heartbeat\r\nevent: thread_output\r\ndata: {"text":"héllo"}\r\n\r\ndata: first\ndata: second\n\nevent: incomplete\ndata: ignored');
  const events = [];
  const body = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  await consumeServerEvents(body, event => events.push(event));
  assert.deepEqual(events, [
    { event: 'thread_output', data: '{"text":"héllo"}' },
    { event: 'message', data: 'first\nsecond' },
  ]);
});

test('SSE rejects unbounded event data and cancels its reader', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${'x'.repeat(1024 * 1024 + 1)}`)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(consumeServerEvents(body, () => {}), /size limit/);
  assert.equal(cancelled, true);
});

test('SSE dispatches a complete event ending with a final CR delimiter', async () => {
  const events = [];
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: complete\r\r'));
    controller.close();
  } });
  await consumeServerEvents(body, event => events.push(event));
  assert.deepEqual(events, [{ event: 'message', data: 'complete' }]);
});
