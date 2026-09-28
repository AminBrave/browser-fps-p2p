import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, peerIdToNumeric, INPUT_FLAGS, PLAYER_CONFIG } from '../../src/config/index.js';
import { generateObjectPlacements } from '../../src/config/objectPlacement.js';
import { createInput } from '../../src/ecs/components/Input.js';
import { createTransform } from '../../src/ecs/components/Transform.js';
import { createPhysics } from '../../src/ecs/components/Physics.js';
import { createPlayer } from '../../src/ecs/components/Player.js';
import { createWeapon, createLoadout } from '../../src/ecs/components/Weapon.js';

test('configuration validates successfully', () => assert.equal(validateConfig(), true));

test('peer IDs hash deterministically', () => {
  assert.equal(peerIdToNumeric('peer-a'), peerIdToNumeric('peer-a'));
  assert.notEqual(peerIdToNumeric('peer-a'), peerIdToNumeric('peer-b'));
  assert.ok(peerIdToNumeric('peer-a') >= 1);
  assert.equal(peerIdToNumeric(7), 7);
});

test('component factories return isolated state', () => {
  const a = createInput(); const b = createInput();
  a.inputMask = INPUT_FLAGS.FORWARD;
  assert.equal(b.inputMask, 0);
  assert.deepEqual(createTransform(1, 2, 3, 0.4, -0.2), { position: { x: 1, y: 2, z: 3 }, rotation: { yaw: 0.4, pitch: -0.2 } });
  assert.deepEqual(createPhysics('body', 'collider', 'controller'), { rigidBody: 'body', collider: 'collider', controller: 'controller', velocity: { x: 0, y: 0, z: 0 }, isGrounded: false });
  const player = createPlayer(5, 'peer-a', true, false, 75);
  assert.equal(player.health, 75);
});

test('weapon factories create independent state and loadouts', () => {
  const a = createWeapon(); const b = createWeapon();
  a.magazine = 0;
  assert.notEqual(a.magazine, b.magazine);
  const loadout = createLoadout();
  assert.ok(loadout.slots.length >= 1);
  assert.equal(loadout.active, 0);
  assert.equal(loadout.slots[0].magazine, loadout.slots[0].magazineSize);
});

test('object placement is deterministic, bounded and respects reserved zones', () => {
  const options = {
    pattern: 'POISSON', count: 30, density: 1, seed: 'unit-test',
    bounds: { halfWidth: 40, halfLength: 40 }, padding: 3, minSpacing: 4,
    reservedZones: [{ x: 0, z: 0, radius: 8 }],
    reservedRectangles: [{ x: 20, z: 20, halfWidth: 4, halfLength: 4 }],
  };
  const a = generateObjectPlacements(options);
  assert.deepEqual(a, generateObjectPlacements(options));
  for (const p of a) {
    assert.ok(p.x >= -37 && p.x <= 37);
    assert.ok(p.z >= -37 && p.z <= 37);
    assert.ok(p.x * p.x + p.z * p.z >= 64);
  }
});

test('player configuration has positive physical limits', () => {
  assert.ok(PLAYER_CONFIG.SPEED > 0);
  assert.ok(PLAYER_CONFIG.HEIGHT > PLAYER_CONFIG.RADIUS);
});
