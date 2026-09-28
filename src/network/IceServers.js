import { NETWORK_CONFIG } from '../config/index.js';

/**
 * Resolve ICE servers at runtime.
 *
 * TURN credentials are deployment configuration, not source-code constants.
 * The deployment /api/ice endpoint returns a short-lived/provider-scoped ICE list.
 * Production builds fail fast when TURN is unavailable because STUN alone
 * cannot provide broad Internet NAT traversal.
 */
export async function resolveIceServers() {
  const servers = [...NETWORK_CONFIG.WEBRTC.STUN_SERVERS];

  if (import.meta.env.DEV) {
    return {
      iceServers: servers,
      hasTurn: false,
      source: 'development-stun-only',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      NETWORK_CONFIG.WEBRTC.TURN_CONFIG_TIMEOUT_MS
    );

    const response = await fetch('/api/ice', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`ICE service returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const turnServers = Array.isArray(payload?.iceServers)
      ? payload.iceServers
      : [];

    for (const server of turnServers) {
      if (!server?.urls) continue;
      servers.push(server);
    }

    return {
      iceServers: servers,
      hasTurn: turnServers.some((server) =>
        String(server?.urls || '').startsWith('turn')
      ),
      source: payload?.source || 'runtime',
    };
  } catch (error) {
    console.warn('[Network] TURN configuration unavailable.', error);
    const message = error instanceof Error ? error.message : String(error);

    if (NETWORK_CONFIG.WEBRTC.REQUIRE_TURN_IN_PRODUCTION) {
      throw new Error(
        'Production TURN configuration is unavailable. ' +
        'Configure METERED_TURN_CREDENTIAL_URL and METERED_TURN_API_KEY on the deployment environment. ' +
        message
      );
    }

    return {
      iceServers: servers,
      hasTurn: false,
      source: 'stun-fallback',
      error: message,
    };
  }
}
