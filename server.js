import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end(body);
}

async function handleIce(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, {
      error: 'Method not allowed',
    });
  }

  const endpoint = String(process.env.METERED_TURN_CREDENTIAL_URL || '').trim();
  const apiKey = String(process.env.METERED_TURN_API_KEY || '').trim();

  if (!endpoint || !apiKey) {
    return sendJson(res, 503, {
      error: 'TURN service is not configured',
      code: 'TURN_NOT_CONFIGURED',
    });
  }

  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('TURN credential URL must use HTTP or HTTPS');
    }

    url.searchParams.set('apiKey', apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(
        '[ICE] Metered request failed',
        response.status,
        body.slice(0, 300)
      );
      return sendJson(res, 502, {
        error: 'TURN provider unavailable',
        code: 'TURN_PROVIDER_ERROR',
      });
    }

    const iceServers = await response.json();

    if (!Array.isArray(iceServers)) {
      return sendJson(res, 502, {
        error: 'TURN provider returned an invalid ICE configuration',
        code: 'TURN_INVALID_RESPONSE',
      });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return sendJson(res, 200, {
      iceServers,
      source: 'metered',
    });
  } catch (error) {
    console.error('[ICE] Failed to load TURN configuration', error);
    return sendJson(res, 502, {
      error: 'Unable to load TURN configuration',
      code: 'TURN_FETCH_ERROR',
    });
  }
}

function safeDistPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, '');
  const filePath = path.resolve(DIST_DIR, relative);

  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    return null;
  }

  return filePath;
}

function serveFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');

  if (requestUrl.pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (requestUrl.pathname === '/api/ice') {
    return handleIce(req, res);
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      error: 'API route not found',
    });
  }

  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  const requestedPath = safeDistPath(requestUrl.pathname);
  if (!requestedPath) {
    return sendJson(res, 400, { error: 'Invalid path' });
  }

  if (serveFile(res, requestedPath)) return;

  // SPA fallback: only application routes reach index.html.
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (serveFile(res, indexPath)) return;

  sendJson(res, 500, {
    error: 'Frontend build is unavailable',
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
