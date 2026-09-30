import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkClock } from '../../src/game/simulation/network/NetworkClock.js';

test('NetworkClock estimates server-to-local clock offset and smooths jitter', () => {
  const clock = new NetworkClock({ tickRate: 60, smoothing: 0.1 });
  assert.equal(clock.getOffsetMs(), null);
  clock.observe(60, 1100);
  assert.equal(clock.getOffsetMs(), 100);
  clock.observe(120, 2105);
  assert.ok(clock.getOffsetMs() > 100 && clock.getOffsetMs() < 101);
  assert.equal(Math.round(clock.serverTickToLocalMs(180)), 3101);
  assert.equal(clock.localMsToServerTick(3100.5), 180);
});

test('NetworkClock ignores stale and invalid samples and resets', () => {
  const clock = new NetworkClock();
  clock.observe(60, 1100);
  const offset = clock.getOffsetMs();
  clock.observe(59, 1099);
  clock.observe(NaN, 1);
  assert.equal(clock.getOffsetMs(), offset);
  clock.reset();
  assert.equal(clock.getOffsetMs(), null);
  assert.equal(clock.getState().samples, 0);
});

test('NetworkClock validates configuration', () => {
  assert.throws(() => new NetworkClock({ tickRate: 0 }), RangeError);
  assert.throws(() => new NetworkClock({ smoothing: 0 }), RangeError);
  assert.throws(() => new NetworkClock({ smoothing: 1.1 }), RangeError);
});
