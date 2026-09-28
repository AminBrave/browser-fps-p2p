// src/game/simulation/movement/FpsMovement.js

/**
 * Pure FPS movement simulation.
 *
 * This module intentionally knows nothing about ECS, Rapier, Three.js, DOM,
 * networking, or audio. Configuration and input interpretation are supplied
 * by the caller so the function can be tested in isolation.
 */
export function applyFpsMovement({
  inputMask,
  yaw,
  velocity,
  isGrounded,
  dt,
  stance,
  inputFlags,
  movementConfig,
}) {
  let forward = 0;
  let strafe = 0;

  if (((inputMask & inputFlags.FORWARD) !== 0)) forward += 1;
  if (((inputMask & inputFlags.BACKWARD) !== 0)) forward -= 1;
  if (((inputMask & inputFlags.RIGHT) !== 0)) strafe += 1;
  if (((inputMask & inputFlags.LEFT) !== 0)) strafe -= 1;

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

  let speed = movementConfig.speed;
  const sprinting =
    ((inputMask & inputFlags.SPRINT) !== 0) &&
    ((inputMask & inputFlags.FORWARD) !== 0) &&
    stance === movementConfig.stanceStand;

  if (sprinting) speed *= movementConfig.sprintMultiplier;
  if (stance === movementConfig.stanceCrouch) {
    speed *= movementConfig.speedMultipliers[movementConfig.stanceCrouch];
  } else if (stance === movementConfig.stanceProne) {
    speed *= movementConfig.speedMultipliers[movementConfig.stanceProne];
  }

  const canJump = stance !== movementConfig.stanceProne;

  velocity.x = (fx * forward + rx * strafe) * speed;
  velocity.z = (fz * forward + rz * strafe) * speed;

  if (isGrounded) {
    velocity.y = -0.1;
    if (canJump && ((inputMask & inputFlags.JUMP) !== 0)) {
      velocity.y = movementConfig.jumpForce;
      return false;
    }
    return true;
  }

  velocity.y += movementConfig.gravity * dt;
  return false;
}

export function moveIntensity(velocity, maxSpeed) {
  if (!velocity) return 0;
  const horizontalSpeed = Math.hypot(velocity.x || 0, velocity.z || 0);
  return Math.min(1, horizontalSpeed / Math.max(Number(maxSpeed) || 0.001, 0.001));
}
