import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFpsMovement,
  moveIntensity,
} from '../src/game/simulation/movement/FpsMovement.js';

const INPUT_FLAGS = Object.freeze({
  FORWARD: 1 << 0,
  BACKWARD: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  SPRINT: 1 << 4,
  JUMP: 1 << 5,
});

const STANCE = Object.freeze({
  STAND: 0,
  CROUCH: 1,
  PRONE: 2,
});

const MOVEMENT_CONFIG = Object.freeze({
  speed: 10,
  sprintMultiplier: 1.5,
  jumpForce: 8,
  gravity: -20,
  speedMultipliers: Object.freeze({
    [STANCE.CROUCH]: 0.5,
    [STANCE.PRONE]: 0.25,
  }),
  stanceStand: STANCE.STAND,
  stanceCrouch: STANCE.CROUCH,
  stanceProne: STANCE.PRONE,
});

const hasFlag = (mask, flag) => (mask & flag) !== 0;

const simulate = (inputMask, options = {}) => {
  const velocity = { x: 0, y: 0, z: 0 };
  const grounded = applyFpsMovement({
    inputMask,
    yaw: options.yaw ?? 0,
    velocity,
    isGrounded: options.isGrounded ?? true,
    dt: options.dt ?? 1 / 60,
    stance: options.stance ?? STANCE.STAND,
    inputFlags: INPUT_FLAGS,
    movementConfig: MOVEMENT_CONFIG
  });
  return { velocity, grounded };
};

test('normalizes diagonal movement instead of increasing speed', () => {
  const forward = simulate(INPUT_FLAGS.FORWARD);
  const diagonal = simulate(INPUT_FLAGS.FORWARD | INPUT_FLAGS.RIGHT);

  assert.equal(Math.hypot(forward.velocity.x, forward.velocity.z), 10);
  assert.ok(Math.abs(Math.hypot(diagonal.velocity.x, diagonal.velocity.z) - 10) < 1e-12);
});

test('rotates movement with yaw', () => {
  const { velocity } = simulate(INPUT_FLAGS.FORWARD, { yaw: Math.PI / 2 });

  assert.ok(Math.abs(velocity.x + 10) < 1e-12);
  assert.ok(Math.abs(velocity.z) < 1e-12);
});

test('sprint requires forward input and standing stance', () => {
  const sprintForward = simulate(INPUT_FLAGS.FORWARD | INPUT_FLAGS.SPRINT);
  const sprintStrafe = simulate(INPUT_FLAGS.RIGHT | INPUT_FLAGS.SPRINT);
  const crouchSprint = simulate(
    INPUT_FLAGS.FORWARD | INPUT_FLAGS.SPRINT,
    { stance: STANCE.CROUCH }
  );

  assert.equal(Math.hypot(sprintForward.velocity.x, sprintForward.velocity.z), 15);
  assert.equal(Math.hypot(sprintStrafe.velocity.x, sprintStrafe.velocity.z), 10);
  assert.equal(Math.hypot(crouchSprint.velocity.x, crouchSprint.velocity.z), 5);
});

test('prone cannot jump', () => {
  const { velocity, grounded } = simulate(
    INPUT_FLAGS.JUMP,
    { stance: STANCE.PRONE }
  );

  assert.equal(grounded, true);
  assert.equal(velocity.y, -0.1);
});

test('grounded jump consumes grounded state and applies jump force', () => {
  const { velocity, grounded } = simulate(INPUT_FLAGS.JUMP);

  assert.equal(grounded, false);
  assert.equal(velocity.y, 8);
});

test('airborne movement applies gravity to vertical velocity', () => {
  const { velocity, grounded } = simulate(0, {
    isGrounded: false,
    dt: 0.1,
  });

  assert.equal(grounded, false);
  assert.equal(velocity.y, -2);
});

test('move intensity is bounded to 0..1', () => {
  assert.equal(moveIntensity(null, 10), 0);
  assert.equal(moveIntensity({ x: 3, y: 0, z: 4 }, 10), 0.5);
  assert.equal(moveIntensity({ x: 100, y: 0, z: 0 }, 10), 1);
});
