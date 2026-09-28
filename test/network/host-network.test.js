import test from 'node:test';
import assert from 'node:assert/strict';
import { HostNetworkSystem } from '../../src/ecs/systems/network/HostNetworkSystem.js';
import { Protocol } from '../../src/network/Protocol.js';
import { INPUT_FLAGS } from '../../src/config/index.js';

function makeTransport() {
  let handler = null;
  const sent = [];
  const closed = [];
  return {
    onData(fn) { handler = fn; },
    sendTo(peerId, packet) { sent.push({ peerId, packet }); },
    broadcast(packet) { sent.push({ peerId: '*', packet }); },
    getPeerIds() { return ['peer-a']; },
    isConnected() { return true; },
    closePeer(peerId) { closed.push(peerId); },
    deliver(peerId, packet) { handler(peerId, new DataView(packet)); },
    sent,
    closed,
  };
}

function makeWorld(entity) {
  return {
    with(...components) {
      assert.ok(components.length > 0);
      return [entity];
    },
  };
}

test('host accepts only newer client input sequences', () => {
  const transport = makeTransport();
  const system = new HostNetworkSystem(transport);
  const entity = {
    player: { id: 2, peerId: 'peer-a', isLocal: false, isDead: false, health: 100 },
    transform: { position: { x: 0, y: 1, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    input: {},
  };

  transport.deliver('peer-a', Protocol.encodeClientInput(10, INPUT_FLAGS.FORWARD, 0.1, 0.2, -1, true));
  transport.deliver('peer-a', Protocol.encodeClientInput(9, INPUT_FLAGS.BACKWARD, 0.2, 0.3, -1, false));
  system.preUpdate(makeWorld(entity));

  assert.equal(entity.input.sequence, 10);
  assert.equal(entity.input.inputMask, INPUT_FLAGS.FORWARD);
  assert.equal(entity.input.isAiming, true);
  assert.equal(system.lastProcessedSequence.get('peer-a'), 10);
});

test('host derives authoritative stance from validated input flags', () => {
  const transport = makeTransport();
  const system = new HostNetworkSystem(transport);
  const entity = {
    player: { id: 2, peerId: 'peer-a', isLocal: false, isDead: false },
    transform: { position: { x: 0, y: 1, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    input: {},
  };
  transport.deliver('peer-a', Protocol.encodeClientInput(1, INPUT_FLAGS.PRONE, 0, 0));
  system.preUpdate(makeWorld(entity));
  assert.equal(entity.input.stance, 2);
});

test('host broadcasts snapshots only to connected peers', () => {
  const transport = makeTransport();
  const system = new HostNetworkSystem(transport);
  const entity = {
    player: { id: 2, peerId: 'peer-a', isLocal: false, isDead: false, health: 90, kills: 2, deaths: 1, isHost: false },
    transform: { position: { x: 1, y: 2, z: 3 }, rotation: { yaw: 0.5, pitch: -0.2 } },
    input: { stance: 1, isAiming: true },
    physics: { velocity: { x: 1, y: 0, z: -1 }, isGrounded: true },
    weapon: { typeId: 2 },
  };
  system.postUpdate(makeWorld(entity), 100000);
  assert.equal(transport.sent.length, 1);
  const snapshot = Protocol.decodeWorldSnapshot(transport.sent[0].packet);
  assert.equal(snapshot.entities[0].entityId, 2);
  assert.equal(snapshot.entities[0].health, 90);
  assert.equal(snapshot.entities[0].isAiming, true);
});

test('host rejects malformed client input without applying it', () => {
  const transport = makeTransport();
  const system = new HostNetworkSystem(transport);
  const entity = {
    player: { id: 2, peerId: 'peer-a', isLocal: false, isDead: false },
    transform: { position: { x: 0, y: 1, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    input: {},
  };
  const packet = Protocol.encodeClientInput(1, 0, 0, 0, -1, false);
  new DataView(packet).setFloat32(7, NaN, true);
  transport.deliver('peer-a', packet);
  system.preUpdate(makeWorld(entity));
  assert.equal(entity.input.sequence, undefined);
  assert.deepEqual(transport.closed, ['peer-a']);
});
