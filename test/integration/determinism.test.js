import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFpsMovement } from '../../src/game/simulation/movement/FpsMovement.js';
import { INPUT_FLAGS, PLAYER_CONFIG, STANCE } from '../../src/config/index.js';
import { createImpactSeed } from '../../src/game/simulation/combat/ImpactSeed.js';
import { sampleDirectionAroundVector } from '../../src/game/simulation/combat/ShotDirection.js';

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

function simulate(inputs, dt = 1 / 60) {
  const velocity = { x: 0, y: 0, z: 0 };
  let grounded = true;
  let position = { x: 0, y: 0, z: 0 };
  for (const inputMask of inputs) {
    grounded = applyFpsMovement({
      inputMask, yaw: 0, velocity, isGrounded: grounded, dt,
      stance: STANCE.STAND, inputFlags: INPUT_FLAGS, movementConfig,
    });
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;
    position.z += velocity.z * dt;
  }
  return { position, velocity, grounded };
}

test('same input stream produces exactly the same movement state', () => {
  const inputs = [
    INPUT_FLAGS.FORWARD,
    INPUT_FLAGS.FORWARD,
    INPUT_FLAGS.FORWARD | INPUT_FLAGS.RIGHT,
    INPUT_FLAGS.JUMP,
    0,
    0,
  ];
  assert.deepEqual(simulate(inputs), simulate(inputs));
});

test('same authoritative impact identity produces the same visual seed', () => {
  const args = { shooterId: 'peer-a', weaponId: 2, position: { x: 1.2, y: 2.3, z: -4.5 }, material: 'concrete', sequence: 19 };
  assert.equal(createImpactSeed(args), createImpactSeed(args));
});

test('injected projectile randomness is reproducible across peers', () => {
  const randomValues = [0.1, 0.7];
  let i = 0;
  const first = sampleDirectionAroundVector({
    direction: { x: 0.2, y: 0.1, z: -0.97 }, spread: 0.02, random: () => randomValues[i++],
  });
  i = 0;
  const second = sampleDirectionAroundVector({
    direction: { x: 0.2, y: 0.1, z: -0.97 }, spread: 0.02, random: () => randomValues[i++],
  });
  assert.deepEqual(first, second);
});
