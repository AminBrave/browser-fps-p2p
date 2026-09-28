import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePositionError,
  magnitude,
  calculateVisualCorrection,
} from '../src/game/simulation/network/ReconciliationModel.js';

test('position error compares authoritative state to prediction at ACK', () => {
  const error = calculatePositionError(
    { x: 10, y: 2, z: -4 },
    { x: 9.5, y: 2.25, z: -3 }
  );

  assert.deepEqual(error, { x: 0.5, y: -0.25, z: -1 });
  assert.equal(magnitude(error), Math.sqrt(1.3125));
});

test('visual correction compares pre-reconciliation current state to corrected replay state', () => {
  const correction = calculateVisualCorrection(
    { x: 12, y: 3, z: 8 },
    { x: 11.5, y: 2.75, z: 7.25 }
  );

  assert.deepEqual(correction, { x: 0.5, y: 0.25, z: 0.75 });
});

test('zero correction remains zero', () => {
  assert.deepEqual(
    calculateVisualCorrection({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }),
    { x: 0, y: 0, z: 0 }
  );
});
