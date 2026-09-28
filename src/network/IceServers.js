import { NETWORK_CONFIG, normalizeNetworkConnectionMode } from '../config/index.js';

/**
 * Build the ICE server list without making TURN a hard dependency.
 *
 * Connectivity is progressive by design:
 *   1. browser host candidates;
 *   2. configured/public STUN discovery;
 *   3. optional self-hosted TURN;
 *   4. optional external TURN provider.
 *
 * WebRTC itself decides which candidate path works. If an optional TURN
 * source is unavailable, the game continues with the candidates already
 * available instead of failing the session.
 */
export async function resolveIceServers(requestedMode = NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE) {
  const mode = normalizeNetworkConnectionMode(requestedMode);
  const servers = [...NETWORK_CONFIG.WEBRTC.STUN_SERVERS];
  const sources = ['stun'];
  const isDirect = mode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.DIRECT;
  const isRelay = mode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.RELAY || mode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.RELAY_TCP_TLS;

  if (isDirect) {
    return { mode, iceServers: servers, hasTurn: false, source: 'direct-stun-only', sources };
  }

  if (import.meta.env.DEV) {
    return {
      iceServers: isRelay ? [] : servers,
      hasTurn: false,
      mode,
      source: isRelay ? 'development-no-turn' : 'development-stun-only',
      sources,
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
    let turnServers = Array.isArray(payload?.iceServers)
      ? payload.iceServers.filter((server) => server?.urls)
      : [];

    if (mode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.RELAY_TCP_TLS) {
      turnServers = turnServers.map((server) => {
        const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => {
          const value = String(url).toLowerCase();
          return value.startsWith('turns:') || value.includes('?transport=tcp');
        });
        return urls.length ? { ...server, urls } : null;
      }).filter(Boolean);
    }

    const iceServers = isRelay ? turnServers : [...servers, ...turnServers];

    if (turnServers.length) {
      sources.push(payload?.source || 'turn');
    }

    return {
      iceServers,
      mode,
      hasTurn: turnServers.some((server) =>
        Array.isArray(server?.urls)
          ? server.urls.some((url) => String(url).startsWith('turn'))
          : String(server?.urls || '').startsWith('turn')
      ),
      source: sources.join('+'),
      sources,
    };
  } catch (error) {
    console.info(
      '[Network] Optional ICE fallback unavailable; continuing with direct/STUN WebRTC.',
      error
    );

    return {
      iceServers: isRelay ? [] : servers,
      mode,
      hasTurn: false,
      source: isRelay ? 'turn-unavailable' : 'stun-fallback',
      sources,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
