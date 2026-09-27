// src/network/PacketTypes.js

/**
 * Unique single-byte headers (0-255) identifying network packet structures
 * sent over WebRTC DataChannels between Host and Clients.
 */
export const PACKET_TYPES = {
  JOIN_REQUEST: 1,
  JOIN_ACCEPT: 2,
  CLIENT_INPUT: 3,
  WORLD_SNAPSHOT: 4,
  // Alias used by ClientGame._handleServerPacket
  STATE_SNAPSHOT: 4,
  GAME_EVENT: 5,
  JOIN_REJECT: 6,
  DISCONNECT: 7,
  // Authoritative match definition sent before a client builds its world.
  WORLD_INIT: 8,
};

export const EVENT_TYPES = {
  PLAYER_HIT: 1,
  PLAYER_DIED: 2,
  PLAYER_RESPAWN: 3,
  SHOT: 4,
  IMPACT: 5,
  SFX: 6,
};
