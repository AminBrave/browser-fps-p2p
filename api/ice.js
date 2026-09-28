/**
 * Vercel-compatible /api/ice endpoint.
 *
 * ICE strategy:
 *   1. STUN/direct candidates are always available.
 *   2. Self-hosted TURN can be configured with TURN_* variables.
 *   3. Cloudflare Realtime TURN can issue short-lived credentials from
 *      server-side secrets, which is the recommended managed option.
 *   4. The legacy generic external TURN endpoint remains supported.
 *
 * TURN credentials are never embedded in the frontend build.
 */

function parseJsonEnv(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[ICE] Ignoring invalid JSON in ${name}`, error);
    return null;
  }
}

function getSelfHostedTurnServers() {
  const urls = parseJsonEnv('TURN_URLS_JSON');
  const username = String(process.env.TURN_USERNAME || '').trim();
  const credential = String(process.env.TURN_CREDENTIAL || '').trim();

  if (!Array.isArray(urls) || !urls.length || !username || !credential) {
    return [];
  }

  const validUrls = urls.filter((url) => /^turns?:/i.test(String(url)));
  return validUrls.length ? [{ urls: validUrls, username, credential }] : [];
}

function normalizeIceServers(servers) {
  if (!Array.isArray(servers)) return [];

  return servers
    .filter((server) => server && server.urls)
    .map((server) => ({
      urls: Array.isArray(server.urls) ? server.urls : [server.urls],
      ...(server.username ? { username: String(server.username) } : {}),
      ...(server.credential ? { credential: String(server.credential) } : {}),
    }))
    .map((server) => ({
      ...server,
      urls: server.urls.filter((url) => {
        // Some TURN providers expose port 53 as an alternate transport.
        // Browsers commonly block it, so avoid adding a guaranteed timeout.
        return !/:53(?:\\?|$)/i.test(String(url));
      }),
    }))
    .filter((server) => server.urls.length > 0);
}

async function getCloudflareTurnServers() {
  const keyId = String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim();
  const apiToken = String(process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim();

  if (!keyId || !apiToken) return [];

  const ttl = Math.min(
    Math.max(Number(process.env.CLOUDFLARE_TURN_TTL_SECONDS || 3600), 300),
    172800
  );

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ttl }),
      }
    );

    if (!response.ok) {
      console.warn('[ICE] Cloudflare TURN credential request failed', response.status);
      return [];
    }

    const payload = await response.json();
    return normalizeIceServers(payload?.iceServers);
  } catch (error) {
    console.warn('[ICE] Cloudflare TURN credential request failed', error);
    return [];
  }
}

async function getOptionalExternalTurnServers() {
  const endpoint = String(process.env.TURN_CREDENTIAL_URL || '').trim();
  const apiKey = String(process.env.TURN_API_KEY || '').trim();

  if (!endpoint || !apiKey) return [];

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
      console.warn('[ICE] Optional external TURN returned HTTP', response.status);
      return [];
    }

    const servers = await response.json();
    return normalizeIceServers(servers);
  } catch (error) {
    console.warn(
      '[ICE] Optional external TURN unavailable; continuing without it',
      error
    );
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const selfHosted = getSelfHostedTurnServers();
  const cloudflare = await getCloudflareTurnServers();
  const external = cloudflare.length ? [] : await getOptionalExternalTurnServers();

  const turnServers = [...selfHosted, ...cloudflare, ...external];
  const sources = ['stun'];

  if (selfHosted.length) sources.push('self-hosted-turn');
  if (cloudflare.length) sources.push('cloudflare-turn');
  if (external.length) sources.push('external-turn');

  const iceServers = [
    ...turnServers,
  ];

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  return res.status(200).json({
    iceServers,
    hasTurn: turnServers.length > 0,
    source: sources.join('+'),
  });
}
