import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkSimulator } from '../../src/network/NetworkSimulator.js';

test('NetworkSimulator delivers deterministic delayed packets', () => {
  const sim = new NetworkSimulator({ latencyMs: 50, jitterMs: 0, random: () => 0.9 });
  assert.equal(sim.send(new Uint8Array([1,2,3]), 0), 1);
  assert.deepEqual(sim.receive(49), []);
  assert.equal(sim.receive(50).length, 1);
});

test('NetworkSimulator supports loss, duplication, reordering and bandwidth', () => {
  const loss = new NetworkSimulator({ loss: 1, random: () => 0 });
  assert.equal(loss.send(new Uint8Array([1]), 0), 0);
  const sim = new NetworkSimulator({
    latencyMs: 0,
    bandwidthBytesPerSecond: 1000,
    duplicate: 1,
    reorder: 1,
    random: () => 0.5
  });
  sim.send(new Uint8Array(100), 0);
  sim.send(new Uint8Array(100), 0);
  assert.equal(sim.receive(201).length, 4);
  sim.clear();
  assert.deepEqual(sim.receive(100), []);
});
