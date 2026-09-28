import test from 'node:test';
import assert from 'node:assert/strict';
import { SpawnSafety } from '../src/physics/SpawnSafety.js';

const safeGround = { entity: { id: 'floor' } };
const clearSpaceWithGround = (origin, direction) => {
  if (direction.y < 0) return safeGround;
  return null;
};

function createSafety(castRay, players = []) {
  return new SpawnSafety({
    castRay,
    getPlayers: () => players,
  });
}

test('rejects positions outside map bounds', () => {
  const safety = createSafety(() => safeGround);
  assert.equal(safety.isSafe({ x: 999, y: 1, z: 0 }), false);
});

test('rejects overlapping living players', () => {
  const player = { player: { isDead: false }, transform: { position: { x: 0, y: 1, z: 0 } } };
  const safety = createSafety(() => safeGround, [player]);
  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }), false);
});

test('ignores the requested entity and dead players', () => {
  const ignored = { player: { isDead: false }, transform: { position: { x: 0, y: 1, z: 0 } } };
  const dead = { player: { isDead: true }, transform: { position: { x: 0, y: 1, z: 0 } } };
  const safety = createSafety(clearSpaceWithGround, [ignored, dead]);
  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }, { ignoreEntity: ignored }), true);
});

test('rejects radial, ground, and ceiling collisions', () => {
  let mode = 'radial';
  const safety = createSafety(() => {
    if (mode === 'radial') return { entity: { id: 'wall' } };
    if (mode === 'ground') return null;
    return safeGround;
  });

  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }), false);

  mode = 'ground';
  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }), false);

  mode = 'ceiling';
  const ceiling = { entity: { id: 'ceiling' } };
  const calls = [];
  const ceilingSafety = createSafety((origin, direction) => {
    calls.push({ origin, direction });
    if (direction.y > 0) return ceiling;
    return safeGround;
  });
  assert.equal(ceilingSafety.isSafe({ x: 0, y: 1, z: 0 }), false);
  assert.ok(calls.length > 0);
});

test('passes a clear position with supporting ground', () => {
  const calls = [];
  const safety = createSafety((origin, direction) => {
    calls.push({ origin, direction });
    return direction.y < 0 ? safeGround : null;
  });
  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }), true);
  assert.ok(calls.length >= 3 * 16 + 2);
});
