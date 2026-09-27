// src/config/constants.js
// Compatibility barrel for older modules. New code should import the domain
// config it needs from ./index.js or the specific config module.

import { NETWORK_CONFIG, PROTOCOL_CONFIG } from './network.js';
import { PLAYER_CONFIG, PLAYER_CHARACTER_CONFIG, STANCE, getPlayerEyeOffset } from './player.js';
import { INPUT_FLAGS } from './input.js';
import { FIRE_MODE, WEAPON_CONFIG, WEAPON_LOADOUT, DEFAULT_WEAPON } from './weapons.js';
import { GAME_CONFIG as GAMEPLAY_CONFIG } from './gameplay.js';
import { CAMERA_CONFIG } from './camera.js';
import { COMBAT_CONFIG } from './combat.js';

export { NETWORK_CONFIG, PROTOCOL_CONFIG, PLAYER_CONFIG, PLAYER_CHARACTER_CONFIG, INPUT_FLAGS, FIRE_MODE, STANCE, WEAPON_CONFIG, WEAPON_LOADOUT, DEFAULT_WEAPON, CAMERA_CONFIG, COMBAT_CONFIG, getPlayerEyeOffset };

// Legacy GAME_CONFIG surface. Values have a single owner in their domain
// config; this object only preserves the public API used by older systems.
export const GAME_CONFIG = Object.freeze({
  ...GAMEPLAY_CONFIG,
  TICK_RATE: GAMEPLAY_CONFIG.TICK_RATE,
  MAX_PLAYERS: PLAYER_CONFIG.MAX_PLAYERS,
  PLAYER_SPEED: PLAYER_CONFIG.SPEED,
  PLAYER_JUMP_FORCE: PLAYER_CONFIG.JUMP_FORCE,
  GRAVITY: PLAYER_CONFIG.GRAVITY,
  PLAYER_HEIGHT: PLAYER_CONFIG.HEIGHT,
  PLAYER_RADIUS: PLAYER_CONFIG.RADIUS,
  CAMERA_HEIGHT_OFFSET: PLAYER_CONFIG.CAMERA_HEIGHT_OFFSET,
  CAMERA_HEIGHT_CROUCH: PLAYER_CONFIG.CAMERA_HEIGHT_CROUCH,
  CAMERA_HEIGHT_PRONE: PLAYER_CONFIG.CAMERA_HEIGHT_PRONE,
  SPEED_MULT_CROUCH: PLAYER_CONFIG.SPEED_MULTIPLIERS[STANCE.CROUCH],
  SPEED_MULT_PRONE: PLAYER_CONFIG.SPEED_MULTIPLIERS[STANCE.PRONE],
  MAX_HEALTH: PLAYER_CONFIG.MAX_HEALTH,
  RESPAWN_TIME_MS: PLAYER_CONFIG.RESPAWN_TIME_MS,
  FOV: CAMERA_CONFIG.FOV,
  NEAR_PLANE: CAMERA_CONFIG.NEAR_PLANE,
  FAR_PLANE: CAMERA_CONFIG.FAR_PLANE,
  RECONCILIATION_THRESHOLD: COMBAT_CONFIG.RECONCILIATION_THRESHOLD,
  MOVE_SPREAD_MAX: COMBAT_CONFIG.MOVE_SPREAD_MAX,
});

export function peerIdToNumeric(peerId) {
  if (typeof peerId === 'number' && Number.isFinite(peerId)) return peerId >>> 0;
  if (!peerId || typeof peerId !== 'string') return 1;
  let hash = NETWORK_CONFIG.PEER_ID_HASH.OFFSET_BASIS;
  for (let i = 0; i < peerId.length; i++) {
    hash ^= peerId.charCodeAt(i);
    hash = Math.imul(hash, NETWORK_CONFIG.PEER_ID_HASH.PRIME);
  }
  return (hash >>> 0) || 1;
}
