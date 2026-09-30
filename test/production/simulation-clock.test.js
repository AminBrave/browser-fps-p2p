import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock } from '../../src/core/SimulationClock.js';

test('SimulationClock advances exact fixed ticks and exposes interpolation alpha', () => {
  const clock = new SimulationClock({ tickRate: 60, maxCatchUpTicks: 5 });
  const ticks = [];
  const result = clock.advance(1 / 30, (dt, tick) => ticks.push([dt, tick]));
  assert.equal(result.steps, 2);
  assert.deepEqual(ticks.map((x) => x[1]), [1, 2]);
  assert.equal(clock.tickToSeconds(60), 1);
  assert.equal(clock.secondsToTicks(0.5), 30);
  assert.equal(result.dropped, false);
});

test('SimulationClock clamps pathological frame deltas and drops excess catch-up', () => {
  const clock = new SimulationClock({ tickRate: 60, maxCatchUpTicks: 2 });
  const result = clock.advance(10);
  assert.equal(result.steps, 2);
  assert.equal(result.dropped, true);
  assert.equal(result.alpha, 0);
});

test('SimulationClock validates constructor options and reset', () => {
  assert.throws(() => new SimulationClock({ tickRate: 0 }), RangeError);
  assert.throws(() => new SimulationClock({ maxCatchUpTicks: 0 }), RangeError);
  const clock = new SimulationClock();
  clock.advance(1 / 60);
  clock.reset();
  assert.equal(clock.tick, 0);
  assert.equal(clock.accumulator, 0);
});
