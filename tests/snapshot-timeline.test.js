import test from 'node:test';
import assert from 'node:assert/strict';
import {
  insertSnapshot,
  sampleSnapshotPair,
  lerpAngle,
} from '../src/game/simulation/network/SnapshotTimeline.js';

test('snapshot insertion rejects stale timestamps and bounds history', () => {
  const buffer = [];
  insertSnapshot(buffer, { timestamp: 10, id: 1 }, 3);
  insertSnapshot(buffer, { timestamp: 20, id: 2 }, 3);
  insertSnapshot(buffer, { timestamp: 15, id: 99 }, 3);
  insertSnapshot(buffer, { timestamp: 30, id: 3 }, 3);
  insertSnapshot(buffer, { timestamp: 40, id: 4 }, 3);

  assert.deepEqual(buffer.map((s) => s.id), [2, 3, 4]);
});

test('snapshot sampling interpolates between the two surrounding states', () => {
  const buffer = [
    { timestamp: 100, value: 10 },
    { timestamp: 200, value: 30 },
    { timestamp: 300, value: 50 },
  ];

  const sample = sampleSnapshotPair(buffer, 150);

  assert.equal(sample.older.value, 10);
  assert.equal(sample.newer.value, 30);
  assert.equal(sample.alpha, 0.5);
});

test('snapshot sampling clamps before and after the available history', () => {
  const buffer = [
    { timestamp: 100 },
    { timestamp: 200 },
  ];

  const before = sampleSnapshotPair(buffer, 50);
  const after = sampleSnapshotPair(buffer, 250);

  assert.equal(before.older.timestamp, 100);
  assert.equal(before.newer.timestamp, 200);
  assert.equal(before.alpha, 0);

  assert.equal(after.older.timestamp, 200);
  assert.equal(after.newer.timestamp, 200);
  assert.equal(after.alpha, 1);
});

test('angle interpolation crosses the -PI/PI boundary through the shortest arc', () => {
  const from = (179 * Math.PI) / 180;
  const to = (-179 * Math.PI) / 180;
  const halfway = lerpAngle(from, to, 0.5);

  assert.ok(Math.abs(Math.abs(halfway) - Math.PI) < 1e-6);
});

test('invalid snapshot timestamps are ignored', () => {
  const buffer = [];
  insertSnapshot(buffer, { timestamp: NaN }, 4);
  insertSnapshot(buffer, { timestamp: Infinity }, 4);
  assert.equal(buffer.length, 0);
});
