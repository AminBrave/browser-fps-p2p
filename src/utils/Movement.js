// src/utils/Movement.js

import { PLAYER_CONFIG, INPUT_FLAGS, STANCE } from '../config/index.js';
import {
  applyFpsMovement as applyPureFpsMovement,
  moveIntensity as calculateMoveIntensity,
} from '../game/simulation/movement/FpsMovement.js';

const MOVEMENT_CONFIG = Object.freeze({
  speed: PLAYER_CONFIG.SPEED,
  sprintMultiplier: PLAYER_CONFIG.SPRINT_MULTIPLIER,
  jumpForce: PLAYER_CONFIG.JUMP_FORCE,
  gravity: PLAYER_CONFIG.GRAVITY,
  speedMultipliers: PLAYER_CONFIG.SPEED_MULTIPLIERS,
  stanceStand: STANCE.STAND,
  stanceCrouch: STANCE.CROUCH,
  stanceProne: STANCE.PRONE,
});

/**
 * Compatibility adapter for legacy ECS systems.
 *
 * New simulation code should depend on the pure function in
 * game/simulation/movement/FpsMovement.js.
 */
export function applyFpsMovement(inputMask, yaw, velocity, isGrounded, dt, stance = STANCE.STAND) {
  return applyPureFpsMovement({
    inputMask,
    yaw,
    velocity,
    isGrounded,
    dt,
    stance,
    inputFlags: INPUT_FLAGS,
    movementConfig: MOVEMENT_CONFIG,
  });
}

/** Horizontal speed factor 0..1 for sway / accuracy. */
export function moveIntensity(velocity) {
  return calculateMoveIntensity(velocity, PLAYER_CONFIG.SPEED);
}
