// src/config/player.js

export const STANCE = Object.freeze({ STAND: 0, CROUCH: 1, PRONE: 2 });

export const PLAYER_CONFIG = Object.freeze({
  MAX_PLAYERS: 4,
  SPEED: 8.0,
  SPRINT_MULTIPLIER: 1.35,
  JUMP_FORCE: 6.5,
  GRAVITY: -19.62,
  HEIGHT: 1.8,
  RADIUS: 0.34,
  SPEED_MULTIPLIERS: Object.freeze({
    [STANCE.STAND]: 1,
    [STANCE.CROUCH]: 0.45,
    [STANCE.PRONE]: 0.2,
  }),
  MAX_HEALTH: 100,
  RESPAWN_TIME_MS: 3000,
  CAMERA_HEIGHT_OFFSET: 0.73,
  CAMERA_HEIGHT_CROUCH: 0.377,
  CAMERA_HEIGHT_PRONE: -0.054,
});

export const PLAYER_CHARACTER_CONFIG = Object.freeze({
  HEAD_CENTER_Y: 0.67,
  EYE_ABOVE_HEAD: 0.06,
  POSE: Object.freeze({
    [STANCE.STAND]: Object.freeze({ offsetY: 0, scaleY: 1 }),
    [STANCE.CROUCH]: Object.freeze({ offsetY: -0.28, scaleY: 0.9 }),
    [STANCE.PRONE]: Object.freeze({ offsetY: -0.58, scaleY: 0.72 }),
  }),
});

export function getPlayerEyeOffset(stance = STANCE.STAND) {
  const pose = PLAYER_CHARACTER_CONFIG.POSE[stance] || PLAYER_CHARACTER_CONFIG.POSE[STANCE.STAND];
  return pose.offsetY +
    (PLAYER_CHARACTER_CONFIG.HEAD_CENTER_Y + PLAYER_CHARACTER_CONFIG.EYE_ABOVE_HEAD) * pose.scaleY;
}
