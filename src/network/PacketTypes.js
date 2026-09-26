// src/network/PacketTypes.js

/**
 * Unique single-byte headers (0-255) identifying network packet structures 
 * sent over WebRTC DataChannels between Host and Clients.
 */
export const PACKET_TYPES = {
  // Client -> Host: Sent periodically to announce join intent
  JOIN_REQUEST: 1,

  // Host -> Client: Acknowledges client join with assigned Entity ID & Player Slot
  JOIN_ACCEPT: 2,

  // Client -> Host: Unreliable input commands (bitmasks, look angles, sequence number)
  CLIENT_INPUT: 3,

  // Host -> All Clients: Unreliable state snapshot containing authoritative entity positions
  WORLD_SNAPSHOT: 4,

  // Host -> All Clients: Reliable event notifications (damage, kills, respawns)
  GAME_EVENT: 5,

  // Host -> Client: Connection rejection notification (e.g., room full)
  JOIN_REJECT: 6,

  // Client -> Host / Host -> Client: Graceful exit signal
  DISCONNECT: 7,
};

/**
 * Sub-types for discrete game events sent via PACKET_TYPES.GAME_EVENT
 */
export const EVENT_TYPES = {
  PLAYER_HIT: 1,
  PLAYER_DIED: 2,
  PLAYER_RESPAWN: 3,
};