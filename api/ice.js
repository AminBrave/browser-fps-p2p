/**
 * Vercel Function: returns the current TURN ICE server configuration.
 *
 * Required environment variables:
 *   METERED_TURN_CREDENTIAL_URL
 *   METERED_TURN_API_KEY
 *
 * Example URL:
 *   https://YOUR_APP.metered.live/api/v1/turn/credentials
 *
 * The Metered credential API returns the ICE server array. The API key is
 * kept server-side here; browsers receive only the resulting ICE config.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const endpoint = String(process.env.METERED_TURN_CREDENTIAL_URL || '').trim();
  const apiKey = String(process.env.METERED_TURN_API_KEY || '').trim();

  if (!endpoint || !apiKey) {
    return res.status(503).json({
      error: 'TURN service is not configured',
      code: 'TURN_NOT_CONFIGURED',
    });
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set('apiKey', apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[ICE] Metered request failed', response.status, body.slice(0, 300));
      return res.status(502).json({
        error: 'TURN provider unavailable',
        code: 'TURN_PROVIDER_ERROR',
      });
    }

    const iceServers = await response.json();

    if (!Array.isArray(iceServers)) {
      return res.status(502).json({
        error: 'TURN provider returned an invalid ICE configuration',
        code: 'TURN_INVALID_RESPONSE',
      });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      iceServers,
      source: 'metered',
    });
  } catch (error) {
    console.error('[ICE] Failed to load TURN configuration', error);
    return res.status(502).json({
      error: 'Unable to load TURN configuration',
      code: 'TURN_FETCH_ERROR',
    });
  }
}
