import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFpsMovement, moveIntensity } from '../../src/game/simulation/movement/FpsMovement.js';
import { INPUT_FLAGS, PLAYER_CONFIG, STANCE } from '../../src/config/index.js';

const movementConfig = {
  speed: PLAYER_CONFIG.SPEED,
  sprintMultiplier: PLAYER_CONFIG.SPRINT_MULTIPLIER,
  jumpForce: PLAYER_CONFIG.JUMP_FORCE,
  gravity: PLAYER_CONFIG.GRAVITY,
  stanceStand: STANCE.STAND,
  stanceCrouch: STANCE.CROUCH,
  stanceProne: STANCE.PRONE,
  speedMultipliers: PLAYER_CONFIG.SPEED_MULTIPLIERS,
};

function step(inputMask, overrides = {}) {
  const velocity = overrides.velocity || { x: 0, y: 0, z: 0 };
  const grounded = applyFpsMovement({
    inputMask,
    yaw: overrides.yaw ?? 0,
    velocity,
    isGrounded: overrides.isGrounded ?? true,
    dt: overrides.dt ?? 1 / 60,
    stance: overrides.stance ?? STANCE.STAND,
    inputFlags: INPUT_FLAGS,
    movementConfig,
  });
  return { velocity, grounded };
}

test('forward movement follows yaw and configured speed', () => {
  const { velocity } = step(INPUT_FLAGS.FORWARD, { yaw: 0 });
  assert.equal(velocity.x, 0);
  assert.equal(velocity.z, -PLAYER_CONFIG.SPEED);
});

test('diagonal movement is normalized', () => {
  const { velocity } = step(INPUT_FLAGS.FORWARD | INPUT_FLAGS.RIGHT);
  assert.ok(Math.abs(Math.hypot(velocity.x, velocity.z) - PLAYER_CONFIG.SPEED) < 1e-9);
});

test('sprint requires forward input and standing stance', () => {
  const sprint = step(INPUT_FLAGS.FORWARD | INPUT_FLAGS.SPRINT);
  const sideways = step(INPUT_FLAGS.RIGHT | INPUT_FLAGS.SPRINT);
  const crouched = step(INPUT_FLAGS.FORWARD | INPUT_FLAGS.SPRINT, { stance: STANCE.CROUCH });
  assert.equal(Math.hypot(sprint.velocity.x, sprint.velocity.z), PLAYER_CONFIG.SPEED * PLAYER_CONFIG.SPRINT_MULTIPLIER);
  assert.equal(Math.hypot(sideways.velocity.x, sideways.velocity.z), PLAYER_CONFIG.SPEED);
  assert.equal(Math.hypot(crouched.velocity.x, crouched.velocity.z), PLAYER_CONFIG.SPEED * PLAYER_CONFIG.SPEED_MULTIPLIERS[STANCE.CROUCH]);
});

test('jump consumes grounded state and applies jump force', () => {
  const { velocity, grounded } = step(INPUT_FLAGS.JUMP);
  assert.equal(grounded, false);
  assert.equal(velocity.y, PLAYER_CONFIG.JUMP_FORCE);
});

test('prone players cannot jump', () => {
  const { velocity, grounded } = step(INPUT_FLAGS.JUMP, { stance: STANCE.PRONE });
  assert.equal(grounded, true);
  assert.equal(velocity.y, -0.1);
});

test('airborne movement applies gravity', () => {
  const { velocity, grounded } = step(0, { isGrounded: false, velocity: { x: 0, y: 5, z: 0 } });
  assert.equal(grounded, false);
  assert.equal(velocity.y, 5 + PLAYER_CONFIG.GRAVITY / 60);
});

test('moveIntensity clamps to one', () => {
  assert.equal(moveIntensity({ x: 0, y: 0, z: 0 }, 10), 0);
  assert.equal(moveIntensity({ x: 3, y: 0, z: 4 }, 10), 0.5);
  assert.equal(moveIntensity({ x: 30, y: 0, z: 40 }, 10), 1);
});
