import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Device login polls /auth/token and must recognise 428 as "keep waiting";
// a wrapped error lost its code and aborted every login on the first poll.
async function withStatus(status, fn) {
  const server = http.createServer((req, res) => { res.statusCode = status; res.end('{}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.DSHREM_API_BASE = `http://localhost:${server.address().port}/api/dshrem/v1`;
  process.env.DSHREM_ALLOW_LOCALHOST = '1';
  try { return await fn(); } finally { server.close(); }
}

const { request } = await import('../src/api.mjs');

for (const [status, code] of [[428, 'authorization_pending'], [403, 'authorization_denied'], [401, 'unauthorized'], [429, 'rate_limited'], [500, 'remote_http_error']]) {
  test(`HTTP ${status} keeps code ${code}`, async () => {
    await withStatus(status, async () => {
      await assert.rejects(request('/auth/token', { method: 'POST', body: {} }), (error) => error.code === code && error.status === status);
    });
  });
}
