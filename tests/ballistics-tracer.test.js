import test from 'node:test';
import assert from 'node:assert/strict';
import { BallisticsTracer } from '../src/game/simulation/combat/BallisticsTracer.js';

test('tracer returns a ballistic path when nothing is hit', () => {
  const tracer = new BallisticsTracer({ castRay: () => null });
  const result = tracer.trace(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    100,
    5,
    null,
    {}
  );

  assert.equal(result.hit, null);
  assert.ok(result.distance > 0);
  assert.ok(result.path.length > 1);
  assert.equal(result.penetrated, 0);
});

test('tracer stops at a player hit and returns accumulated flight data', () => {
  const target = { player: { id: 'target' } };
  const tracer = new BallisticsTracer({
    castRay: () => ({
      toi: 1,
      entity: target,
      normal: { x: 0, y: 0, z: 1 },
    }),
  });

  const result = tracer.trace(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    100,
    10,
    null,
    {}
  );

  assert.equal(result.hit.entity, target);
  assert.equal(result.point.z, -1);
  assert.equal(result.penetrated, 0);
  assert.ok(result.flightTime > 0);
});

test('tracer uses material exit queries for penetration', () => {
  let exitCalls = 0;
  const wall = { id: 'wall' };
  const tracer = new BallisticsTracer({
    castRay: () => ({
      toi: 1,
      collider: wall,
      entity: { id: 'wallEntity' },
      material: 'default',
      normal: { x: 0, y: 0, z: 1 },
    }),
    getProjectileExitHit: () => {
      exitCalls++;
      return {
        distance: 0.1,
        normal: { x: 0, y: 0, z: -1 },
      };
    },
  });

  const result = tracer.trace(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    100,
    10,
    null,
    { penetrationPower: 10 }
  );

  assert.ok(exitCalls > 0);
  assert.ok(result.impacts.length > 0);
});
