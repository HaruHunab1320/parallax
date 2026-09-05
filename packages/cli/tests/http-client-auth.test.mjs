import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { ParallaxHttpClient } from '../src/utils/http-client.ts';

test('CLI carries the API key on HTTP and WebSocket and honors explicit configuration', async () => {
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push(request.headers.authorization);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ patterns: [] }));
  });
  const wsServer = new WebSocketServer({ server });
  wsServer.on('connection', (socket, request) => {
    seen.push(request.headers.authorization);
    assert.equal(new URL(request.url, 'http://localhost').searchParams.get('executionId'), 'id with space');
    socket.send(JSON.stringify({ status: 'connected' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const previous = process.env.PARALLAX_API_KEY;
  process.env.PARALLAX_API_KEY = 'environment-key';
  let socket;
  try {
    const client = new ParallaxHttpClient({ baseURL });
    await client.listPatterns();
    socket = client.streamExecution('id with space', {});
    await once(socket, 'message');
    const closed = once(socket, 'close'); socket.close(); await closed;
    await new ParallaxHttpClient({ baseURL, apiKey: 'explicit-key' }).listPatterns();
    await new ParallaxHttpClient({ baseURL, accessToken: 'session-token' }).listPatterns();
    assert.deepEqual(seen, ['ApiKey environment-key', 'ApiKey environment-key', 'ApiKey explicit-key', 'Bearer session-token']);
  } finally {
    socket?.terminate();
    wsServer.close();
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.PARALLAX_API_KEY;
    else process.env.PARALLAX_API_KEY = previous;
  }
});
