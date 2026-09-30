import test from 'node:test';
import assert from 'node:assert/strict';
import { LagCompensation } from '../../src/game/simulation/combat/LagCompensation.js';

test('LagCompensation rewinds within configured history window', () => {
  const lag = new LagCompensation({ tickRate: 60, maxRewindMs: 100 });
  for (let tick = 100; tick <= 110; tick++) {
    lag.record(tick, [{ entityId: 7, zone:'head', position:{x:0,y:0,z:tick === 105 ? 0 : 10}, radius:0.5 }]);
  }
  const hit = lag.resolve({
    shotTick: 105,
    origin:{x:0,y:0,z:5},
    direction:{x:0,y:0,z:-1},
    maxDistance:20
  });
  assert.equal(hit.entityId, 7);
  assert.equal(hit.rewindTick, 105);
  assert.equal(hit.clamped, false);
});

test('LagCompensation clamps excessively old shots and rejects misses', () => {
  const lag = new LagCompensation({ tickRate: 60, maxRewindMs: 50 });
  lag.record(100, [{entityId:1, position:{x:10,y:0,z:0}, radius:0.5}]);
  lag.record(110, [{entityId:1, position:{x:10,y:0,z:0}, radius:0.5}]);
  const miss = lag.resolve({
    shotTick: 1, origin:{x:0,y:0,z:5}, direction:{x:0,y:0,z:-1}, maxDistance:2
  });
  assert.equal(miss, null);
  assert.equal(lag.history.oldestTick(), 100);
});
