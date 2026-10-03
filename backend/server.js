'use strict';

const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { fetchAndSummarize } = require('./pipeline/fetchAndSummarize');
const { adminDb } = require('./services/firebase');

/**
 * The webhook secret comes only from the environment. There is deliberately no
 * built-in fallback: this repo is public, so any default would be a known token.
 */
function getConfiguredSecret() {
  return process.env.WEBHOOK_SECRET || process.env.CRON_SECRET || null;
}

/**
 * Constant-time string comparison (hashing first makes the lengths equal).
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Extract authentication token from headers or query parameters
 */
function extractToken(req, parsedUrl) {
  // 1. Header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
      return parts[1].trim();
    }
    return authHeader.trim();
  }

  // 2. Custom headers: x-webhook-token or x-api-key
  if (req.headers['x-webhook-token']) {
    return String(req.headers['x-webhook-token']).trim();
  }
  if (req.headers['x-api-key']) {
    return String(req.headers['x-api-key']).trim();
  }

  // 3. Query params: ?token=... or ?secret=... or ?key=...
  const query = parsedUrl && parsedUrl.query ? parsedUrl.query : {};
  if (query.token) return String(query.token).trim();
  if (query.secret) return String(query.secret).trim();
  if (query.key) return String(query.key).trim();

  return null;
}

/**
 * Authenticates the incoming request against the configured secret
 */
function authenticateRequest(req, parsedUrl) {
  const expectedSecret = getConfiguredSecret();
  if (!expectedSecret) {
    return {
      authenticated: false,
      status: 503,
      error: 'Webhook disabled: WEBHOOK_SECRET is not configured on the server.'
    };
  }
  const token = extractToken(req, parsedUrl);
  if (!token) {
    return {
      authenticated: false,
      status: 401,
      error: 'Missing authorization token. Provide token via Authorization header (Bearer <token>), x-webhook-token header, or ?token= query parameter.'
    };
  }
  if (!safeEqual(token, expectedSecret)) {
    return {
      authenticated: false,
      status: 401,
      error: 'Invalid authorization token.'
    };
  }
  return { authenticated: true };
}

/**
 * Helper to parse JSON body from request stream
 */
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Main HTTP request dispatcher
 */
async function handleRequest(req, res) {
  const reqUrl = new URL(req.url || '/', 'http://localhost');
  let pathname = reqUrl.pathname || '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  const query = Object.fromEntries(reqUrl.searchParams.entries());
  const parsedUrl = { pathname, query };
  const method = req.method ? req.method.toUpperCase() : 'GET';

  // Helper JSON response sender
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-token, x-api-key'
    });
    res.end(JSON.stringify(data));
  };

  // CORS preflight handling
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-token, x-api-key'
    });
    return res.end();
  }

  // Health check endpoint
  if (pathname === '/health' || pathname === '' || pathname === '/') {
    return sendJson(200, {
      status: 'ok',
      service: 'reopsy-backend',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  // Webhook triggering endpoints
  const webhookPaths = ['/api/webhook/fetch', '/webhook', '/api/fetch', '/api/webhook'];
  if (webhookPaths.includes(pathname)) {
    if (method !== 'POST' && method !== 'GET') {
      return sendJson(405, { success: false, error: `Method ${method} not allowed. Use GET or POST.` });
    }

    const auth = authenticateRequest(req, parsedUrl);
    if (!auth.authenticated) {
      const status = auth.status || 401;
      return sendJson(status, {
        success: false,
        error: status === 401 ? `Unauthorized: ${auth.error}` : auth.error
      });
    }

    try {
      let options = {};
      if (method === 'POST') {
        const body = await parseBody(req);
        options = { ...parsedUrl.query, ...body };
      } else {
        options = { ...parsedUrl.query };
      }

      const dryRun = options.dryRun === 'true' || options.dryRun === true;
      const topic = options.topic || undefined;
      const limitPerSource = options.limitPerSource ? Number(options.limitPerSource) : undefined;

      console.log(`[${new Date().toISOString()}] Webhook trigger received: topic=${topic || 'all'}, dryRun=${dryRun}`);

      // Start the pipeline asynchronously so we don't timeout the HTTP request
      fetchAndSummarize({
        dryRun,
        topic,
        limitPerSource,
        db: adminDb
      }).then(result => {
        console.log(`[${new Date().toISOString()}] Pipeline background execution completed successfully.`);
      }).catch(err => {
        console.error(`[${new Date().toISOString()}] Pipeline background execution failed:`, err);
      });

      return sendJson(202, {
        success: true,
        message: 'Pipeline started in background',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Webhook] Error starting pipeline:', err);
      return sendJson(500, {
        success: false,
        error: err.message || 'Pipeline execution failed'
      });
    }
  }

  // 404 Not Found
  return sendJson(404, { success: false, error: `Route not found: ${method} ${pathname}` });
}

/**
 * Factory to create HTTP server instance
 */
function createServer() {
  return http.createServer(handleRequest);
}

/**
 * Starts listening on the configured port
 */
function startServer(port = process.env.PORT || 3000) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`🚀 ReOpSy backend webhook server listening on http://localhost:${port}`);
    console.log(`   Health check: http://localhost:${port}/health`);
    console.log(`   Webhook: POST/GET http://localhost:${port}/api/webhook/fetch (requires token)`);
    if (!getConfiguredSecret()) {
      console.warn('⚠️  WEBHOOK_SECRET is not set: the webhook will reject every request (503) until it is configured.');
    }
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  handleRequest,
  authenticateRequest,
  extractToken,
  startServer,
  getConfiguredSecret,
  safeEqual
};