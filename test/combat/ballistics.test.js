import test from 'node:test';
import assert from 'node:assert/strict';
import { BallisticsTracer } from '../../src/game/simulation/combat/BallisticsTracer.js';

test('ballistics trace reaches range without a hit', () => {
  const tracer = new BallisticsTracer({ castRay: () => null });
  const result = tracer.trace({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 500, 10, null, { airDrag: 0, penetrationPower: 1 });
  assert.equal(result.hit, null);
  assert.ok(result.distance > 0);
  assert.ok(result.path.length > 1);
  assert.equal(result.impacts.length, 0);
});

test('ballistics trace stops at a player hit', () => {
  const player = { player: { id: 2 } };
  const tracer = new BallisticsTracer({
    castRay: (_origin, _direction, _distance) => ({
      toi: 1,
      point: { x: 0, y: 1, z: -1 },
      normal: { x: 0, y: 0, z: 1 },
      entity: player,
      collider: { handle: 7 },
    }),
  });
  const result = tracer.trace({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 500, 20, null, { airDrag: 0, penetrationPower: 1 });
  assert.equal(result.hit.entity, player);
  assert.equal(result.impacts.length, 0);
  assert.equal(result.point.z, -1);
});

test('ballistics records a penetrated surface when exit energy permits', () => {
  let calls = 0;
  const collider = { handle: 9 };
  const tracer = new BallisticsTracer({
    castRay: () => {
      calls++;
      if (calls === 1) {
        return {
          toi: 1,
          normal: { x: 0, y: 0, z: 1 },
          collider,
          material: 'wood',
          entity: null,
        };
      }
      return null;
    },
    getProjectileExitHit: () => ({ distance: 0.1, normal: { x: 0, y: 0, z: -1 } }),
  });
  const result = tracer.trace(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    500,
    20,
    null,
    { airDrag: 0, penetrationPower: 2 }
  );
  assert.equal(result.impacts.length, 1);
  assert.equal(result.impacts[0].material, 'wood');
  assert.ok(result.impacts[0].velocityAfter < result.impacts[0].velocityBefore);
});
