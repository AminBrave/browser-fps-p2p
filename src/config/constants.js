// src/config/constants.js

export const NETWORK_CONFIG = {
  // Server/Host tick rate in Hz (ticks per second)
  SERVER_TICK_RATE: 60,
  // Network broadcast rate for world snapshots (Hz)
  SNAPSHOT_BROADCAST_RATE: 30,
  // Input transmission rate from client to host (Hz)
  INPUT_SEND_RATE: 60,
  // Entity interpolation buffer delay in milliseconds
  INTERPOLATION_BUFFER_MS: 100,
  // Max input history stored for client prediction rewind/reconciliation
  INPUT_HISTORY_SIZE: 128,
  // Host reconciliation position snap threshold (meters)
  RECONCILIATION_THRESHOLD: 0.15,
};

export const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  PLAYER_SPEED: 8.0,
  PLAYER_JUMP_FORCE: 6.5,
  GRAVITY: -19.62,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,
  CAMERA_HEIGHT_OFFSET: 1.6,
  MAX_HEALTH: 100,
  RESPAWN_TIME_MS: 3000,
  MAP_BOUNDS: {
    WIDTH: 50,
    LENGTH: 50,
    HEIGHT: 15,
  },
};

export const INPUT_FLAGS = {
  FORWARD: 1 << 0,  // 0000 0001
  BACKWARD: 1 << 1, // 0000 0010
  LEFT:     1 << 2, // 0000 0100
  RIGHT:    1 << 3, // 0000 1000
  JUMP:     1 << 4, // 0001 0000
  SHOOT:    1 << 5, // 0010 0000
  RELOAD:   1 << 6, // 0100 0000
  CROUCH:   1 << 7, // 1000 0000
};

export const WEAPON_CONFIG = {
  PISTOL: {
    ID: 1,
    NAME: 'Pistol',
    FIRE_RATE_MS: 200,
    DAMAGE: 25,
    AMMO_CAPACITY: 12,
    RELOAD_TIME_MS: 1500,
    RANGE: 100,
    RECOIL_PITCH: 0.05,
  },
};