import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShotEvent } from '../src/game/simulation/combat/ShotEventModel.js';
import { EVENT_TYPES } from '../src/network/PacketTypes.js';

test('shot event model is independent of hit physics metadata fallback', () => {
  const event = buildShotEvent({
    shooterId: 'p1',
    weapon: { typeId: 2, muzzleVelocity: 500, sfx: 'rifle' },
    origin: { x: 0, y: 1, z: 0 },
    end: { x: 0, y: 1, z: -10 },
    hit: { material: 'metal', entity: { player: false } },
    normal: { x: 0, y: 0, z: 1 },
    direction: { x: 0, y: 0, z: -1 },
    trace: { distance: 10, velocity: 450, penetrated: 1, impacts: [] },
    pelletIndex: 0,
  });
  assert.equal(event.type, EVENT_TYPES.SHOT);
  assert.equal(event.material, 'metal');
  assert.equal(event.distance, 10);
  assert.equal(event.terminalVelocity, 450);
  assert.equal(event.primary, true);
});

test('shot event model does not mutate trace or weapon', () => {
  const weapon = { typeId: 1, muzzleVelocity: 400 };
  const trace = { distance: 5, velocity: 390, impacts: [] };
  const event = buildShotEvent({
    shooterId: 'p1', weapon, origin: {}, end: {}, trace,
    normal: {}, direction: {}, pelletIndex: 1,
  });
  assert.equal(event.primary, false);
  assert.equal(weapon.muzzleVelocity, 400);
  assert.equal(trace.distance, 5);
  assert.ok(Object.isFrozen(event));
});
