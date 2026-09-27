import { NETWORK_CONFIG } from '../config/index.js';

/**
 * Resolve ICE servers at runtime.
 *
 * TURN credentials are deployment configuration, not source-code constants.
 * The Vercel /api/ice endpoint returns a short-lived/provider-scoped ICE list.
 * If it is unavailable, STUN remains available and direct P2P can still work.
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
    console.warn('[Network] TURN configuration unavailable; using STUN only.', error);
    return {
      iceServers: servers,
      hasTurn: false,
      source: 'stun-fallback',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
