import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkDiagnostics } from '../../src/network/NetworkDiagnostics.js';

test('NetworkDiagnostics keeps bounded frame samples and exposes p95', () => {
  const d = new NetworkDiagnostics({ sampleLimit: 30 });
  for (let i = 1; i <= 31; i++) d.recordFrame(i);
  d.recordSimulation(2);
  d.recordRender(3);
  d.recordCorrection();
  const s = d.snapshot();
  assert.equal(s.frameP95Ms, 30);
  assert.equal(s.simulationP95Ms, 2);
  assert.equal(s.renderP95Ms, 3);
  assert.equal(s.corrections, 1);
  assert.ok(s.fpsP95Equivalent > 0);
});

test('NetworkDiagnostics ignores invalid samples and resets', () => {
  const d = new NetworkDiagnostics();
  d.recordFrame(Infinity);
  d.recordSimulation(NaN);
  d.recordRender(-4);
  assert.equal(d.snapshot().frameP95Ms, 0);
  assert.equal(d.snapshot().renderP95Ms, 0);
  d.reset();
  assert.equal(d.snapshot().corrections, 0);
});
