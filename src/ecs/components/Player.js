// src/ecs/components/Player.js

/**
 * Player Component Data Schema
 * Tracks player identification, network peer mappings, health status, and match statistics.
 */
export const PlayerComponent = {
  id: 0,
  peerId: '',
  isLocal: false,
  isHost: false,
  health: 100,
  maxHealth: 100,
  isDead: false,
  respawnTimer: 0,
  lastDamagedAt: 0,
  impactMarkClearAccumulator: 0,
  kills: 0,
  deaths: 0,
};

/**
 * Creates a default Player data structure.
 * @param {number} id - Assigned entity ID (numeric, used in binary snapshots).
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
    maxHealth,
    isDead: false,
    respawnTimer: 0,
    lastDamagedAt: 0,
    impactMarkClearAccumulator: 0,
    kills: 0,
    deaths: 0,
  };
}
