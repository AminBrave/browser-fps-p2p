// src/utils/Movement.js

import { GAME_CONFIG, INPUT_FLAGS, STANCE } from '../config/constants.js';
import { hasFlag } from './BitFlags.js';

/**
 * Camera-relative FPS movement with stance speed multipliers.
 * @returns {boolean} isGrounded after jump check
 */
export function applyFpsMovement(inputMask, yaw, velocity, isGrounded, dt, stance = STANCE.STAND) {
  let forward = 0;
  let strafe = 0;

  if (hasFlag(inputMask, INPUT_FLAGS.FORWARD)) forward += 1;
  if (hasFlag(inputMask, INPUT_FLAGS.BACKWARD)) forward -= 1;
  if (hasFlag(inputMask, INPUT_FLAGS.RIGHT)) strafe += 1;
  if (hasFlag(inputMask, INPUT_FLAGS.LEFT)) strafe -= 1;

  const len = Math.hypot(forward, strafe);
  if (len > 0) {
    forward /= len;
    strafe /= len;
  }

  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const fx = -sinY;
  const fz = -cosY;
  const rx = cosY;
  const rz = -sinY;

  let speed = GAME_CONFIG.PLAYER_SPEED || 8.0;
  if (stance === STANCE.CROUCH) speed *= GAME_CONFIG.SPEED_MULT_CROUCH ?? 0.45;
  else if (stance === STANCE.PRONE) speed *= GAME_CONFIG.SPEED_MULT_PRONE ?? 0.2;

  // Cannot jump while prone
  const canJump = stance !== STANCE.PRONE;

  velocity.x = (fx * forward + rx * strafe) * speed;
  velocity.z = (fz * forward + rz * strafe) * speed;

  if (isGrounded) {
    velocity.y = -0.1;
    if (canJump && hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
      velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE || 6.5;
      return false;
    }
    return true;
  }

  velocity.y += (GAME_CONFIG.GRAVITY || -19.62) * dt;
  return false;
}

/** Horizontal speed factor 0..1 for sway / accuracy */
export function moveIntensity(velocity) {
  if (!velocity) return 0;
  const h = Math.hypot(velocity.x || 0, velocity.z || 0);
  const max = GAME_CONFIG.PLAYER_SPEED || 8;
  return Math.min(1, h / max);
}
