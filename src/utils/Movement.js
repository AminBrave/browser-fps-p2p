// src/utils/Movement.js

import { GAME_CONFIG, INPUT_FLAGS } from '../config/constants.js';
import { hasFlag } from './BitFlags.js';

/**
 * Shared FPS movement helpers.
 *
 * Convention matches Three.js PerspectiveCamera with Euler order 'YXZ':
 *   - yaw = 0  → look down -Z
 *   - pitch     → look up/down (does not affect ground movement)
 *   - forward   = (-sin(yaw), 0, -cos(yaw))
 *   - right     = ( cos(yaw), 0, -sin(yaw))
 */

/**
 * Compute horizontal world-space velocity from input bitmask + look yaw.
 * @param {number} inputMask
 * @param {number} yaw - radians
 * @param {object} velocity - mutated {x,y,z}
 * @param {boolean} isGrounded
 * @param {number} dt
 */
export function applyFpsMovement(inputMask, yaw, velocity, isGrounded, dt) {
  let forward = 0;
  let strafe = 0;

  if (hasFlag(inputMask, INPUT_FLAGS.FORWARD)) forward += 1;
  if (hasFlag(inputMask, INPUT_FLAGS.BACKWARD)) forward -= 1;
  if (hasFlag(inputMask, INPUT_FLAGS.RIGHT)) strafe += 1;
  if (hasFlag(inputMask, INPUT_FLAGS.LEFT)) strafe -= 1;

  // Normalize so diagonal is not faster
  const len = Math.hypot(forward, strafe);
  if (len > 0) {
    forward /= len;
    strafe /= len;
  }

  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  // Camera-forward on XZ plane (Three.js look direction)
  const fx = -sinY;
  const fz = -cosY;
  // Camera-right on XZ plane
  const rx = cosY;
  const rz = -sinY;

  const speed = GAME_CONFIG.PLAYER_SPEED || 8.0;
  velocity.x = (fx * forward + rx * strafe) * speed;
  velocity.z = (fz * forward + rz * strafe) * speed;

  // Vertical: jump / gravity
  if (isGrounded) {
    velocity.y = -0.1; // keep slight downward force for grounded detection
    if (hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
      velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE || 6.5;
      return false; // no longer grounded after jump
    }
    return true;
  }

  velocity.y += (GAME_CONFIG.GRAVITY || -19.62) * dt;
  return false;
}
