/**
 * Vercel-compatible /api/ice endpoint.
 *
 * TURN is optional. The browser can use direct WebRTC + STUN when no
 * relay credentials are configured. If self-hosted TURN is configured,
 * it is preferred; an optional external TURN provider can be used last.
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
    return Array.isArray(servers)
      ? servers.filter((server) => server?.urls)
      : [];
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
  const external = await getOptionalExternalTurnServers();
  const iceServers = [...selfHosted, ...external];

  const sources = ['stun'];
  if (selfHosted.length) sources.push('self-hosted-turn');
  if (external.length) sources.push('external-turn');

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  return res.status(200).json({
    iceServers,
    hasTurn: iceServers.length > 0,
    source: sources.join('+'),
  });
}
