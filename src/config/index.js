// src/config/index.js
// Stable public configuration surface. Domain modules own the values so
// gameplay, networking, camera, combat, input and world tuning stay isolated.

export { NETWORK_CONFIG, PROTOCOL_CONFIG } from './network.js';
export { PLAYER_CONFIG, PLAYER_CHARACTER_CONFIG, STANCE, getPlayerEyeOffset } from './player.js';
export { INPUT_FLAGS } from './input.js';
export { FIRE_MODE, WEAPON_CONFIG, WEAPON_LOADOUT, DEFAULT_WEAPON } from './weapons.js';
export { GAME_CONFIG } from './constants.js';
export { CAMERA_CONFIG } from './camera.js';
export { COMBAT_CONFIG } from './combat.js';
export { PHYSICS_CONFIG } from './physics.js';
export { RENDER_CONFIG } from './render.js';
export { AUDIO_CONFIG } from './audio.js';
export { UI_CONFIG } from './ui.js';
export { WORLD_CONFIG } from './world.js';
export { generateObjectPlacements, OBJECT_PLACEMENT_ALGORITHMS } from './objectPlacement.js';
export {
  PERFORMANCE_PROFILES,
  PERFORMANCE_PROFILE_IDS,
  PERFORMANCE_STORAGE_KEY,
  getSavedPerformanceProfile,
  resolvePerformanceProfile,
  setSavedPerformanceProfile,
  normalizePerformanceProfile,
} from './performance.js';

import { GAME_CONFIG } from './constants.js';
import { NETWORK_CONFIG } from './network.js';
import { WORLD_CONFIG } from './world.js';
import { OBJECT_PLACEMENT_ALGORITHMS } from './objectPlacement.js';

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

  if (errors.length) throw new Error(`Invalid game configuration:\\n- ${errors.join('\\n- ')}`);
  return true;
}

export { peerIdToNumeric } from './constants.js';
