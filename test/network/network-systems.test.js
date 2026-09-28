import test from 'node:test';
import assert from 'node:assert/strict';
import { InterpolationSystem } from '../../src/ecs/systems/network/InterpolationSystem.js';
import { ClientPredictSystem } from '../../src/ecs/systems/network/ClientPredictSystem.js';
import { ClientReconcileSystem } from '../../src/ecs/systems/network/ClientReconcileSystem.js';
import { CircularBuffer } from '../../src/utils/CircularBuffer.js';
import { INPUT_FLAGS, STANCE } from '../../src/config/index.js';

function makeLocalEntity() {
  return {
    player: { id: 1, isLocal: true, isDead: false, health: 100 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    physics: { velocity: { x: 0, y: 0, z: 0 }, isGrounded: true },
    input: { inputMask: 0, yaw: 0, pitch: 0, sequence: 1, stance: STANCE.STAND },
  };
}

test('client prediction advances transform and records replay frame', () => {
  const entity = makeLocalEntity();
  const buffer = new CircularBuffer(16);
  let computedMovement = { x: 0, y: 0, z: 0 };
  const physicsWorld = {
    initialized: true,
    updatePlayerHitZones() {},
  };
  entity.physics.collider = {};
  entity.physics.rigidBody = {
    translation: () => ({ x: 0, y: 0, z: 0 }),
    setNextKinematicTranslation() {},
  };
  entity.physics.controller = {
    computeColliderMovement(_collider, movement) {
      computedMovement = { ...movement };
    },
    computedMovement: () => computedMovement,
  };
  const system = new ClientPredictSystem(physicsWorld, buffer);
  entity.input.inputMask = INPUT_FLAGS.FORWARD;
  system.update(null, entity, 1 / 60);
  assert.ok(entity.transform.position.z < 0);
  assert.equal(buffer.size, 1);
  assert.equal(buffer.peek().sequence, 1);
});

test('client prediction ignores dead players', () => {
  const entity = makeLocalEntity();
  entity.player.isDead = true;
  const buffer = new CircularBuffer(4);
  const system = new ClientPredictSystem({ initialized: true, updatePlayerHitZones() {} }, buffer);
  system.update(null, entity, 1 / 60);
  assert.deepEqual(entity.transform.position, { x: 0, y: 0, z: 0 });
  assert.equal(buffer.size, 0);
});

test('interpolation updates remote visuals but leaves local prediction untouched', () => {
  const system = new InterpolationSystem(0);
  const local = makeLocalEntity();
  const remote = {
    player: { id: 2, isLocal: false, health: 100 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    input: {},
  };
  system.snapshotBuffer = [
    { timestamp: 100, players: [{ id: 2, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, health: 100 }] },
    { timestamp: 200, players: [{ id: 2, x: 10, y: 2, z: -4, yaw: Math.PI, pitch: 0.4, health: 80 }] },
  ];
  system.update(null, [local, remote], local, 150);
  assert.deepEqual(remote.transform.position, { x: 5, y: 1, z: -2 });
  assert.equal(remote.player.health, 80);
  assert.deepEqual(local.transform.position, { x: 0, y: 0, z: 0 });
});

test('reconciliation ignores stale server ticks', () => {
  const entity = makeLocalEntity();
  const buffer = new CircularBuffer(8);
  const system = new ClientReconcileSystem({ initialized: true }, buffer);
  const snapshot = { serverTick: 5, lastAckedSeq: 0, entities: [{ entityId: 1, x: 0, y: 0, z: 0, health: 100 }] };
  assert.equal(system.update(null, entity, snapshot), false);
  assert.equal(system.update(null, entity, snapshot), false);
  assert.equal(system.lastServerTick, 5);
});

test('reconciliation updates authoritative health even when no ACK frame exists', () => {
  const entity = makeLocalEntity();
  const buffer = new CircularBuffer(8);
  const system = new ClientReconcileSystem({ initialized: true }, buffer);
  const snapshot = { serverTick: 1, lastAckedSeq: 7, entities: [{ entityId: 1, x: 0, y: 0, z: 0, health: 42, isDead: false }] };
  assert.equal(system.update(null, entity, snapshot), false);
  assert.equal(entity.player.health, 42);
});
