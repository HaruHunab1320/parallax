import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

test('stream requests refresh once, carry the current token and reject another origin', async () => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization });
    if (request.url === '/api/auth/refresh') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ tokens: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 3600 } }));
      return;
    }
    if (request.headers.authorization !== 'Bearer new-access') { response.writeHead(401); response.end(); return; }
    response.setHeader('Content-Type', 'text/event-stream');
    response.end('event: connected\ndata: {}\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_API_URL = origin;
  const storage = new Map([['parallax_access_token', 'old-access'], ['parallax_refresh_token', 'old-refresh']]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  globalThis.window = { location: { origin, href: origin } };
  globalThis.document = { cookie: '' };
  try {
    const { apiClient } = await import('../src/lib/api-client.ts');
    const response = await apiClient.fetchAuthenticated(`${origin}/stream`, new AbortController().signal);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /connected/);
    assert.deepEqual(requests.map(request => request.url), ['/stream', '/api/auth/refresh', '/stream']);
    assert.equal(requests[0].authorization, 'Bearer old-access');
    assert.equal(requests[2].authorization, 'Bearer new-access');
    assert.equal(storage.get('parallax_refresh_token'), 'new-refresh');
    await assert.rejects(apiClient.fetchAuthenticated('https://other.example/stream', new AbortController().signal), /different API origin/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(apiClient.fetchAuthenticated(`${origin}/stream`, controller.signal), /abort/i);
    assert.equal(requests.length, 3);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete globalThis.localStorage; delete globalThis.window; delete globalThis.document;
  }
});
