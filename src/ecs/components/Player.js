// src/ecs/components/Player.js

/**
 * Player Component Data Schema
 * Tracks player identification, network peer mappings, health status, and match statistics.
 */
export const PlayerComponent = {
  // Unique integer ID assigned to entity
  id: 0,
  // WebRTC Peer ID associated with this player (empty for host)
  peerId: '',
  // Flag indicating if this entity belongs to the local player instance
  isLocal: false,
  // Flag indicating if this entity is controlled by the Host
  isHost: false,
  // Player health state (0 - MAX_HEALTH)
  health: 100,
  // Flag indicating whether player is currently dead
  isDead: false,
  // Respawn timestamp delay tracker (ms)
  respawnTimer: 0,
  // Total player kills in current session
  kills: 0,
  // Total player deaths in current session
  deaths: 0,
};

/**
 * Creates a default Player data structure.
 * @param {number} id - Assigned entity ID.
 * @param {string} peerId - WebRTC Peer ID.
 * @param {boolean} [isLocal=false] - Whether this is the local client.
 * @param {boolean} [isHost=false] - Whether this is the room host.
 * @param {number} [maxHealth=100] - Initial starting health.
 * @returns {typeof PlayerComponent}
 */
export function createPlayer(id, peerId = '', isLocal = false, isHost = false, maxHealth = 100) {
  return {
    id,
    peerId,
    isLocal,
    isHost,
    health: maxHealth,
    isDead: false,
    respawnTimer: 0,
    kills: 0,
    deaths: 0,
  };
}