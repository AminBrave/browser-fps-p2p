import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveInterpolation } from '../../src/game/simulation/network/AdaptiveInterpolation.js';

test('adaptive interpolation tracks snapshot cadence and clamps bounds', () => {
  const a = new AdaptiveInterpolation({ minMs: 50, maxMs: 120, initialMs: 80, safetySamples: 2 });
  assert.equal(a.getDelayMs(), 80);
  a.observeSnapshot(0);
  a.observeSnapshot(100);
  assert.ok(a.getDelayMs() >= 50 && a.getDelayMs() <= 120);
  a.observeSnapshot(1000);
  assert.equal(a.getDelayMs(), 120);
  a.reset();
  assert.equal(a.getDelayMs(), 120);
});

test('invalid observations do not alter delay', () => {
  const a = new AdaptiveInterpolation();
  const before = a.getDelayMs();
  assert.equal(a.observeSnapshot(NaN), before);
});
