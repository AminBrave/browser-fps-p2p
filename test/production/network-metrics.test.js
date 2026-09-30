import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkMetrics } from '../../src/network/NetworkMetrics.js';

test('NetworkMetrics records percentiles and loss', () => {
  const m = new NetworkMetrics({ sampleLimit: 8 });
  [20, 30, 40, 50, 60, 70, 80, 90, 100].forEach((v) => m.recordRtt(v));
  m.recordCorrection(0.1);
  m.recordCorrection(0.4);
  m.recordSnapshotAge(90);
  m.recordPacketReceived();
  m.recordPacketReceived();
  m.recordPacketLost();
  m.recordInterpolationUnderrun();
  const s = m.snapshot();
  assert.equal(s.rttMs, 60);
  assert.equal(s.rttP95Ms, 100);
  assert.equal(s.correctionP95, 0.4);
  assert.equal(s.snapshotAgeMs, 90);
  assert.equal(s.packetLossRatio, 1 / 3);
  assert.equal(s.interpolationUnderruns, 1);
});

test('NetworkMetrics ignores non-finite samples and can reset', () => {
  const m = new NetworkMetrics({ sampleLimit: 8 });
  m.recordRtt(Infinity);
  m.recordSnapshotAge(NaN);
  m.recordCorrection(-2);
  assert.equal(m.snapshot().rttMs, 0);
  assert.equal(m.snapshot().snapshotAgeMs, 0);
  assert.equal(m.snapshot().correctionP95, 0);
  m.reset();
  assert.deepEqual(m.snapshot(), {
    rttMs: 0, rttP95Ms: 0, jitterMs: 0, correctionP95: 0, snapshotAgeMs: 0,
    interpolationUnderruns: 0, packetLossRatio: 0, packetsReceived: 0, packetsLost: 0
  });
});
