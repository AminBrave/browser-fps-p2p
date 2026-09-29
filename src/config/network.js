// src/config/network.js

export const NETWORK_CONFIG = Object.freeze({
  SERVER_TICK_RATE: 60,
  CLIENT_TICK_RATE: 60,
  SNAPSHOT_BROADCAST_RATE: 20,
  INPUT_SEND_RATE: 60,
  INTERPOLATION_BUFFER_MS: 100,
  INPUT_HISTORY_SIZE: 128,
  MAX_INPUT_QUEUE: 16,
  MAX_GAME_EVENT_QUEUE: 32,
  MAX_SNAPSHOT_HISTORY: 16,
  PEER_ID_HASH: Object.freeze({ OFFSET_BASIS: 2166136261, PRIME: 16777619 }),

  SIGNALING: Object.freeze({
    HOST: '',
    PORT: 443,
    PATH: '/',
    SECURE: true,
    DEBUG: 1,
    PING_INTERVAL_MS: 5000,
    RECONNECT_DELAY_MS: 1500,
  }),

  WEBRTC: Object.freeze({
    CONNECTION_MODES: Object.freeze({
      AUTO: 'auto',
      DIRECT: 'direct',
      RELAY: 'relay',
      RELAY_TCP_TLS: 'relay-tcp-tls',
    }),
    CONNECTION_MODE_STORAGE_KEY: 'p2p-fps-network-mode',
    // Public STUN services. These only help discover public/NAT-mapped
    // addresses; they do not provide relay fallback like TURN does.
    STUN_SERVERS: Object.freeze([
      // Keep the default list intentionally small. Multiple STUN/TURN servers
    // increase ICE discovery work and can slow candidate gathering.
    Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
    Object.freeze({ urls: 'stun:stun.cloudflare.com:3478' }),
    ]),
    ICE_TRANSPORT_POLICY: 'all',
    DEFAULT_CONNECTION_MODE: 'auto',
    SDP_SEMANTICS: 'unified-plan',
    SIGNALING_TIMEOUT_MS: 10000,
    DATA_CONNECTION_TIMEOUT_MS: 30000,
    TURN_CONFIG_TIMEOUT_MS: 5000,
    ICE_GATHERING_GRACE_MS: 1000,
    STATS_SAMPLE_DELAY_MS: 1500,
    REQUIRE_TURN_IN_PRODUCTION: false,
  }),

  TRANSPORT: Object.freeze({
    LABEL: 'p2p-fps-game',
    SERIALIZATION: 'binary',
    RELIABLE: true,
    MAX_BUFFERED_BYTES: 2 * 1024 * 1024,
    MAX_PACKET_BYTES: 1024 * 1024,
  }),

  HANDSHAKE: Object.freeze({
    JOIN_TIMEOUT_MS: 10000,
  }),

  MULTIPLAYER: Object.freeze({
    PLAYER_NAME_STORAGE_KEY: 'p2p-fps-player-name',
    DEFAULT_PLAYER_NAME: 'Player',
    MAX_PLAYER_NAME_LENGTH: 16,
    SESSION_TELEMETRY_INTERVAL_MS: 1000,
    CONNECTION_STALE_AFTER_MS: 4000,
    MAX_ROSTER_PLAYERS: 32,
    NETWORK_LOG_INTERVAL_MS: 5000,
  }),

  INVITATION_CODE: Object.freeze({
    LENGTH: 5,
    ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    MAX_RETRIES: 8,
  }),
});

export const PROTOCOL_CONFIG = Object.freeze({
  JOIN_REQUEST_SIZE: 4,
  JOIN_REQUEST_HEADER_SIZE: 4,
  JOIN_REQUEST_MAX_BYTES: 64,
  CLIENT_INPUT_SIZE: 17,
  SNAPSHOT_HEADER_SIZE: 10,
  SNAPSHOT_ENTITY_SIZE: 45,
  JOIN_ACCEPT_SIZE: 18,
  WORLD_INIT_HEADER_SIZE: 5,
  GAME_EVENT_HEADER_SIZE: 5,
  SESSION_STATE_HEADER_SIZE: 5,
  PROTOCOL_VERSION: 1,
  MAX_SNAPSHOT_ENTITIES: 255,
  MAX_UINT8: 255,
  MAX_UINT16: 65535,
});
