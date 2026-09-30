import test from 'node:test';
import assert from 'node:assert/strict';
import { HitboxHistory } from '../../src/game/simulation/combat/HitboxHistory.js';

test('HitboxHistory records bounded frames and samples between ticks', () => {
  const h = new HitboxHistory({ maxTicks: 2 });
  h.record(1, [{ entityId: 1, position: {x:0,y:0,z:0}, yaw:0, radius:0.2, zone:'head' }]);
  h.record(2, [{ entityId: 1, position: {x:2,y:0,z:0}, yaw:Math.PI, radius:0.2, zone:'head' }]);
  h.record(3, [{ entityId: 2, position: {x:0,y:0,z:0}, radius:0.3, halfHeight:0.5 }]);
  assert.equal(h.oldestTick(), 2);
  assert.equal(h.latestTick(), 3);
  const sample = h.sample(2.5);
  assert.equal(sample.hitboxes[0].entityId, 1);
  assert.equal(sample.hitboxes[0].position.x, 2);
  assert.equal(h.get(1), null);
  h.clear();
  assert.equal(h.latestTick(), null);
});

test('HitboxHistory handles empty history and missing newer entities', () => {
  const h = new HitboxHistory();
  assert.equal(h.sample(1), null);
  h.record(1, [{ entityId: 1, position: {x:1,y:2,z:3} }]);
  h.record(2, [{ entityId: 2, position: {x:4,y:5,z:6} }]);
  const sample = h.sample(1);
  assert.equal(sample.hitboxes[0].entityId, 1);
});
