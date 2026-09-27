// src/config/network.js

export const NETWORK_CONFIG = Object.freeze({
  SERVER_TICK_RATE: 60,
  CLIENT_TICK_RATE: 60,
  SNAPSHOT_BROADCAST_RATE: 20,
  INPUT_SEND_RATE: 60,
  INTERPOLATION_BUFFER_MS: 100,
  INPUT_HISTORY_SIZE: 128,
  MAX_SNAPSHOT_HISTORY: 16,
  PEER_ID_HASH: Object.freeze({ OFFSET_BASIS: 2166136261, PRIME: 16777619 }),

  // WebRTC ICE configuration. PeerJS handles signaling, but actual peer
  // connectivity depends on ICE candidates. STUN enables direct NAT traversal;
  // TURN provides a relay fallback when the two players cannot connect
  // directly (symmetric NAT, carrier NAT, restrictive firewalls, etc.).
  WEBRTC: Object.freeze({
    ICE_SERVERS: Object.freeze([
      Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
      Object.freeze({
        urls: [
          'turn:eu-0.turn.peerjs.com:3478',
          'turn:us-0.turn.peerjs.com:3478',
        ],
        username: 'peerjs',
        credential: 'peerjsp',
      }),
    ]),
    SDP_SEMANTICS: 'unified-plan',
  }),

  INVITATION_CODE: Object.freeze({
    LENGTH: 5,
    ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    MAX_RETRIES: 5,
  }),
});

export const PROTOCOL_CONFIG = Object.freeze({
  CLIENT_INPUT_SIZE: 16,
  SNAPSHOT_HEADER_SIZE: 10,
  SNAPSHOT_ENTITY_SIZE: 45,
  JOIN_ACCEPT_SIZE: 18,
  WORLD_INIT_HEADER_SIZE: 5,
  GAME_EVENT_HEADER_SIZE: 5,
  MAX_SNAPSHOT_ENTITIES: 255,
  MAX_UINT8: 255,
  MAX_UINT16: 65535,
});
