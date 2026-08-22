'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer, authenticateRequest, extractToken, DEFAULT_SECRET } = require('../../server');

// Helper to make local HTTP requests to a test server
function makeRequest(server, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const reqOptions = {
      host: '127.0.0.1',
      port: addr.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(data);
        } catch {
          parsedBody = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsedBody
        });
      });
    });

    req.on('error', reject);

    if (bodyData) {
      if (typeof bodyData === 'object') {
        req.write(JSON.stringify(bodyData));
      } else {
        req.write(String(bodyData));
      }
    }
    req.end();
  });
}

test('extractToken handles multiple header and query param formats', () => {
  // Authorization: Bearer <token>
  assert.equal(
    extractToken({ headers: { authorization: 'Bearer secret-xyz' } }, { query: {} }),
    'secret-xyz'
  );

  // Authorization raw
  assert.equal(
    extractToken({ headers: { authorization: 'secret-xyz' } }, { query: {} }),
    'secret-xyz'
  );

  // x-webhook-token
  assert.equal(
    extractToken({ headers: { 'x-webhook-token': 'token-123' } }, { query: {} }),
    'token-123'
  );

  // x-api-key
  assert.equal(
    extractToken({ headers: { 'x-api-key': 'key-999' } }, { query: {} }),
    'key-999'
  );

  // query params
  assert.equal(
    extractToken({ headers: {} }, { query: { token: 'param-token' } }),
    'param-token'
  );
  assert.equal(
    extractToken({ headers: {} }, { query: { secret: 'param-secret' } }),
    'param-secret'
  );
  assert.equal(
    extractToken({ headers: {} }, { query: { key: 'param-key' } }),
    'param-key'
  );

  // Missing
  assert.equal(
    extractToken({ headers: {} }, { query: {} }),
    null
  );
});

test('authenticateRequest validates token correctly', () => {
  // Default secret
  assert.equal(
    authenticateRequest({ headers: { authorization: `Bearer ${DEFAULT_SECRET}` } }, { query: {} }).authenticated,
    true
  );

  // Wrong secret
  assert.equal(
    authenticateRequest({ headers: { authorization: 'Bearer wrong-secret' } }, { query: {} }).authenticated,
    false
  );

  // Missing secret
  assert.equal(
    authenticateRequest({ headers: {} }, { query: {} }).authenticated,
    false
  );
});

test('health check returns HTTP 200 and status ok', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(server, { path: '/health', method: 'GET' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'reopsy-backend');
    assert.ok(typeof res.body.uptime === 'number');
  } finally {
    server.close();
  }
});

test('webhook rejects unauthorized request without token with 401', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(server, { path: '/api/webhook/fetch', method: 'POST' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes('Unauthorized'));
  } finally {
    server.close();
  }
});

test('webhook rejects invalid token with 401', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(server, {
      path: '/api/webhook/fetch',
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  } finally {
    server.close();
  }
});

test('webhook triggers dryRun pipeline execution with valid Bearer token', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(
      server,
      {
        path: '/api/webhook/fetch?dryRun=true',
        method: 'POST',
        headers: {
          authorization: `Bearer ${DEFAULT_SECRET}`,
          'content-type': 'application/json'
        }
      },
      { topic: 'ai-mental-health', limitPerSource: 1 }
    );
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Pipeline started in background');
  } finally {
    server.close();
  }
});

test('webhook triggers dryRun pipeline with valid query token', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(
      server,
      {
        path: `/api/webhook/fetch?token=${DEFAULT_SECRET}&dryRun=true&topic=blockchain`,
        method: 'GET'
      }
    );
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.success, true);
  } finally {
    server.close();
  }
});

test('OPTIONS preflight returns 204', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(server, { path: '/api/webhook/fetch', method: 'OPTIONS' });
    assert.equal(res.statusCode, 204);
  } finally {
    server.close();
  }
});

test('unknown route returns 404', async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, res));

  try {
    const res = await makeRequest(server, { path: '/unknown/endpoint', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
  } finally {
    server.close();
  }
});