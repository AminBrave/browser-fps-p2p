// src/config/index.js
// Public configuration surface. Domain files remain separate so each concern
// has one owner, while gameplay systems import from this stable barrel.

import {
  NETWORK_CONFIG,
  GAME_CONFIG,
  INPUT_FLAGS,
  FIRE_MODE,
  STANCE,
  WEAPON_CONFIG,
  WEAPON_LOADOUT,
  DEFAULT_WEAPON,
  peerIdToNumeric,
} from './constants.js';

import { WORLD_CONFIG } from './world.js';

export {
  NETWORK_CONFIG,
  GAME_CONFIG,
  INPUT_FLAGS,
  FIRE_MODE,
  STANCE,
  WEAPON_CONFIG,
  WEAPON_LOADOUT,
  DEFAULT_WEAPON,
  peerIdToNumeric,
  WORLD_CONFIG,
};

export {
  generateObjectPlacements,
  OBJECT_PLACEMENT_ALGORITHMS,
} from './objectPlacement.js';


export function validateConfig() {
  const errors = [];
  const map = WORLD_CONFIG.MAP;
  const player = WORLD_CONFIG.PLAYER;
  const placement = WORLD_CONFIG.OBJECT_PLACEMENT;

  if (!Number.isFinite(map.WIDTH) || map.WIDTH <= 0) errors.push('MAP.WIDTH must be > 0');
  if (!Number.isFinite(map.LENGTH) || map.LENGTH <= 0) errors.push('MAP.LENGTH must be > 0');
  if (!Number.isFinite(GAME_CONFIG.PLAYER_HEIGHT) || GAME_CONFIG.PLAYER_HEIGHT <= 0) errors.push('PLAYER_HEIGHT must be > 0');
  if (!Number.isFinite(GAME_CONFIG.PLAYER_RADIUS) || GAME_CONFIG.PLAYER_RADIUS <= 0) errors.push('PLAYER_RADIUS must be > 0');
  if (!Number.isFinite(GAME_CONFIG.MAX_PLAYERS) || GAME_CONFIG.MAX_PLAYERS < 1) errors.push('MAX_PLAYERS must be >= 1');
  if (!Number.isFinite(NETWORK_CONFIG.SERVER_TICK_RATE) || NETWORK_CONFIG.SERVER_TICK_RATE < 1) errors.push('SERVER_TICK_RATE must be >= 1');
  if (!Number.isFinite(NETWORK_CONFIG.CLIENT_TICK_RATE) || NETWORK_CONFIG.CLIENT_TICK_RATE < 1) errors.push('CLIENT_TICK_RATE must be >= 1');
  if (!Number.isFinite(NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE) || NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE < 1) errors.push('SNAPSHOT_BROADCAST_RATE must be >= 1');

  const pattern = String(placement?.PATTERN || '').toUpperCase();
  if (!OBJECT_PLACEMENT_ALGORITHMS.includes(pattern)) errors.push(`Unknown OBJECT_PLACEMENT.PATTERN: ${placement?.PATTERN}`);
  if (!Number.isFinite(placement?.DENSITY) || placement.DENSITY < 0 || placement.DENSITY > 1) errors.push('OBJECT_PLACEMENT.DENSITY must be between 0 and 1');
  if (!Number.isFinite(placement?.MAX_OBJECTS) || placement.MAX_OBJECTS < 0) errors.push('OBJECT_PLACEMENT.MAX_OBJECTS must be >= 0');

  if (!Array.isArray(player?.SPAWN_POINTS) || player.SPAWN_POINTS.length < 1) {
    errors.push('PLAYER.SPAWN_POINTS must contain at least one spawn');
  }

  if (errors.length) throw new Error(`Invalid game configuration:\n- ${errors.join('\n- ')}`);
  return true;
}
