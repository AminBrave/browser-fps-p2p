// src/utils/Movement.js

import { PLAYER_CONFIG, INPUT_FLAGS, STANCE } from '../config/index.js';
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

  let speed = PLAYER_CONFIG.SPEED;
  const sprinting = hasFlag(inputMask, INPUT_FLAGS.SPRINT) &&
    hasFlag(inputMask, INPUT_FLAGS.FORWARD) &&
    stance === STANCE.STAND;
  if (sprinting) speed *= PLAYER_CONFIG.SPRINT_MULTIPLIER;
  if (stance === STANCE.CROUCH) speed *= PLAYER_CONFIG.SPEED_MULTIPLIERS[STANCE.CROUCH];
  else if (stance === STANCE.PRONE) speed *= PLAYER_CONFIG.SPEED_MULTIPLIERS[STANCE.PRONE];

  // Cannot jump while prone
  const canJump = stance !== STANCE.PRONE;

  velocity.x = (fx * forward + rx * strafe) * speed;
  velocity.z = (fz * forward + rz * strafe) * speed;

  if (isGrounded) {
    velocity.y = -0.1;
    if (canJump && hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
      velocity.y = PLAYER_CONFIG.JUMP_FORCE;
      return false;
    }
    return true;
  }

  velocity.y += (PLAYER_CONFIG.GRAVITY) * dt;
  return false;
}

/** Horizontal speed factor 0..1 for sway / accuracy */
export function moveIntensity(velocity) {
  if (!velocity) return 0;
  const h = Math.hypot(velocity.x || 0, velocity.z || 0);
  const max = PLAYER_CONFIG.SPEED;
  return Math.min(1, h / max);
}
