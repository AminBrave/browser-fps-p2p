import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end(body);
}

function parseJsonEnv(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) {
    console.warn(`[ICE] Ignoring invalid JSON in ${name}`, error);
    return null;
  }
}

function getSelfHostedTurnServers() {
  const urls = parseJsonEnv('TURN_URLS_JSON');
  const username = String(process.env.TURN_USERNAME || '').trim();
  const credential = String(process.env.TURN_CREDENTIAL || '').trim();

  if (!Array.isArray(urls) || !urls.length || !username || !credential) return [];

  const validUrls = urls.filter((url) => /^turns?:/i.test(String(url)));
  return validUrls.length ? [{ urls: validUrls, username, credential }] : [];
}

async function getOptionalExternalTurnServers() {
  const endpoint = String(process.env.TURN_CREDENTIAL_URL || '').trim();
  const apiKey = String(process.env.TURN_API_KEY || '').trim();
  if (!endpoint || !apiKey) return [];

  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('TURN credential URL must use HTTP or HTTPS');
    url.searchParams.set('apiKey', apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.warn('[ICE] Optional external TURN returned HTTP', response.status);
      return [];
    }

    const servers = await response.json();
    return Array.isArray(servers) ? servers.filter((server) => server?.urls) : [];
  } catch (error) {
    console.warn('[ICE] Optional external TURN unavailable; continuing without it', error);
    return [];
  }
}

async function handleIce(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const selfHosted = getSelfHostedTurnServers();
  const external = await getOptionalExternalTurnServers();
  const iceServers = [...selfHosted, ...external];
  const sources = ['stun'];
  if (selfHosted.length) sources.push('self-hosted-turn');
  if (external.length) sources.push('external-turn');

  return sendJson(res, 200, {
    iceServers,
    hasTurn: iceServers.length > 0,
    source: sources.join('+'),
  });
}

function safeDistPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const relative = decoded.replace(/^\/+/, '');
  const filePath = path.resolve(DIST_DIR, relative);
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) return null;
  return filePath;
}

function serveFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    if (res.req?.method === 'HEAD') return res.end(), true;
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  if (requestUrl.pathname === '/health') return sendJson(res, 200, { ok: true });
  if (requestUrl.pathname === '/api/ice') return handleIce(req, res);
  if (requestUrl.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API route not found' });
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  const requestedPath = safeDistPath(requestUrl.pathname);
  if (!requestedPath) return sendJson(res, 400, { error: 'Invalid path' });
  if (serveFile(res, requestedPath)) return;

  const indexPath = path.join(DIST_DIR, 'index.html');
  if (serveFile(res, indexPath)) return;
  sendJson(res, 500, { error: 'Frontend build is unavailable' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
