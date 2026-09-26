// src/config/constants.js

export const NETWORK_CONFIG = {
  SERVER_TICK_RATE: 60,
  SNAPSHOT_BROADCAST_RATE: 30,
  INPUT_SEND_RATE: 60,
  INTERPOLATION_BUFFER_MS: 100,
  INPUT_HISTORY_SIZE: 128,
  RECONCILIATION_THRESHOLD: 0.15,
};

export const GAME_CONFIG = {
  TICK_RATE: 60,
  MAX_PLAYERS: 4,
  PLAYER_SPEED: 8.0,
  PLAYER_JUMP_FORCE: 6.5,
  GRAVITY: -19.62,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,
  CAMERA_HEIGHT_OFFSET: 1.6,
  MAX_HEALTH: 100,
  RESPAWN_TIME_MS: 3000,
  FOV: 75,
  NEAR_PLANE: 0.05,
  FAR_PLANE: 500,
  MAP_BOUNDS: {
    WIDTH: 80,
    LENGTH: 80,
    HEIGHT: 20,
  },
  INTERPOLATION_DELAY_MS: 100,
  RECONCILIATION_THRESHOLD: 0.15,
  // Camera punch recovery (radians / second)
  RECOIL_RECOVERY: 8.0,
};

export const INPUT_FLAGS = {
  FORWARD: 1 << 0,
  BACKWARD: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  JUMP: 1 << 4,
  SHOOT: 1 << 5,
  RELOAD: 1 << 6,
  CROUCH: 1 << 7,
};

/** Fire mode constants */
export const FIRE_MODE = {
  SEMI: 'semi',
  AUTO: 'auto',
};

export const WEAPON_CONFIG = {
  PISTOL: {
    ID: 1,
    NAME: 'Pistol',
    FIRE_RATE_MS: 180,
    DAMAGE: 25,
    MAGAZINE_SIZE: 12,
    RESERVE_AMMO: 36,
    RELOAD_TIME_MS: 1600,
    RANGE: 120,
    RECOIL_PITCH: 0.045,
    RECOIL_YAW_SPREAD: 0.012,
    FIRE_MODE: FIRE_MODE.SEMI,
  },
  SMG: {
    ID: 2,
    NAME: 'SMG',
    FIRE_RATE_MS: 90,
    DAMAGE: 14,
    MAGAZINE_SIZE: 30,
    RESERVE_AMMO: 90,
    RELOAD_TIME_MS: 2000,
    RANGE: 90,
    RECOIL_PITCH: 0.028,
    RECOIL_YAW_SPREAD: 0.02,
    FIRE_MODE: FIRE_MODE.AUTO,
  },
};

// Default loadout
export const DEFAULT_WEAPON = WEAPON_CONFIG.PISTOL;

export function peerIdToNumeric(peerId) {
  if (typeof peerId === 'number' && Number.isFinite(peerId)) return peerId >>> 0;
  if (!peerId || typeof peerId !== 'string') return 1;
  let hash = 2166136261;
  for (let i = 0; i < peerId.length; i++) {
    hash ^= peerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}
