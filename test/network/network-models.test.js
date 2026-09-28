import test from 'node:test';
import assert from 'node:assert/strict';
import { Protocol } from '../../src/network/Protocol.js';
import { PACKET_TYPES } from '../../src/network/PacketTypes.js';
import { validateClientInput, KNOWN_INPUT_MASK, MAX_PITCH } from '../../src/network/InputValidator.js';
import { insertSnapshot, sampleSnapshotPair, lerpAngle } from '../../src/game/simulation/network/SnapshotTimeline.js';
import { calculatePositionError, magnitude, calculateVisualCorrection } from '../../src/game/simulation/network/ReconciliationModel.js';
import { createWorldManifest, applyWorldManifest, getWorldHash } from '../../src/network/WorldSync.js';
import { INPUT_FLAGS } from '../../src/config/index.js';

test('client input protocol round-trips all fields', () => {
  const packet = Protocol.encodeClientInput(123, INPUT_FLAGS.FORWARD | INPUT_FLAGS.CROUCH, 2.5, -0.4, 3, true);
  assert.deepEqual(Protocol.decodeClientInput(packet), {
    sequence: 123, inputMask: INPUT_FLAGS.FORWARD | INPUT_FLAGS.CROUCH,
    yaw: 2.5, pitch: -0.4, weaponSlot: 3, isAiming: true,
  });
  assert.equal(Protocol.getPacketType(packet), PACKET_TYPES.CLIENT_INPUT);
});

test('malformed input packets are rejected', () => {
  assert.equal(Protocol.decodeClientInput(new ArrayBuffer(1)), null);
  const packet = Protocol.encodeClientInput(1, 0, 0, 0, -1, false);
  new Uint8Array(packet)[0] = PACKET_TYPES.WORLD_SNAPSHOT;
  assert.equal(Protocol.decodeClientInput(packet), null);
});

test('snapshot protocol round-trips authoritative entity state', () => {
  const packet = Protocol.encodeWorldSnapshot(77, 55, [{
    entityId: 9, x: 1.25, y: 2.5, z: -3.75, yaw: 0.4, pitch: -0.2,
    health: 83, stance: 1, weaponId: 2, isDead: true, isHost: true, isAiming: true,
    velocity: { x: 1, y: -2, z: 3 }, isGrounded: false, kills: 4, deaths: 5,
  }]);
  const snapshot = Protocol.decodeWorldSnapshot(packet);
  assert.equal(snapshot.serverTick, 77);
  assert.equal(snapshot.lastAckedSeq, 55);
  assert.equal(snapshot.entities.length, 1);
  assert.equal(snapshot.entities[0].entityId, 9);
  assert.equal(snapshot.entities[0].isDead, true);
  assert.equal(snapshot.entities[0].isAiming, true);
  assert.deepEqual(snapshot.entities[0].velocity, { x: 1, y: -2, z: 3 });
});

test('snapshot decoder rejects malformed length', () => {
  const packet = Protocol.encodeWorldSnapshot(1, []);
  assert.equal(Protocol.decodeWorldSnapshot(packet.slice(0, -1)), null);
});

test('world-init and game-event payloads round-trip', () => {
  const manifest = { map: 'test', seed: 42 };
  assert.deepEqual(Protocol.decodeWorldInit(Protocol.encodeWorldInit(manifest)), manifest);
  const event = { type: 4, shooterId: 'a', damage: 20 };
  assert.deepEqual(Protocol.decodeGameEvent(Protocol.encodeGameEvent(event)), event);
});

test('input validator rejects invalid values and normalizes yaw', () => {
  const valid = validateClientInput({ sequence: 5, inputMask: INPUT_FLAGS.FORWARD, yaw: Math.PI * 3, pitch: 0, weaponSlot: -1, isAiming: false });
  assert.ok(valid.yaw >= -Math.PI && valid.yaw <= Math.PI);
  assert.equal(validateClientInput(null), null);
  assert.equal(validateClientInput({ sequence: -1, inputMask: 0, yaw: 0, pitch: 0, weaponSlot: -1, isAiming: false }), null);
  assert.equal(validateClientInput({ sequence: 1, inputMask: KNOWN_INPUT_MASK + 1, yaw: 0, pitch: 0, weaponSlot: -1, isAiming: false }), null);
  assert.equal(validateClientInput({ sequence: 1, inputMask: 0, yaw: 0, pitch: MAX_PITCH + 0.01, weaponSlot: -1, isAiming: false }), null);
});

test('snapshot timeline ignores non-monotonic timestamps and caps history', () => {
  const buffer = [];
  insertSnapshot(buffer, { timestamp: 10, id: 1 }, 2);
  insertSnapshot(buffer, { timestamp: 20, id: 2 }, 2);
  insertSnapshot(buffer, { timestamp: 15, id: 3 }, 2);
  insertSnapshot(buffer, { timestamp: 30, id: 4 }, 2);
  assert.deepEqual(buffer.map((s) => s.id), [2, 4]);
});

test('snapshot timeline returns correct interpolation pairs', () => {
  const buffer = [{ timestamp: 100 }, { timestamp: 200 }];
  assert.deepEqual(sampleSnapshotPair(buffer, 150), { older: buffer[0], newer: buffer[1], alpha: 0.5 });
  assert.equal(sampleSnapshotPair(buffer, 50).alpha, 0);
  assert.equal(sampleSnapshotPair(buffer, 250).alpha, 1);
});

test('angle interpolation follows the shortest arc', () => {
  const result = lerpAngle(Math.PI * 0.9, -Math.PI * 0.9, 0.5);
  assert.ok(Math.abs(Math.abs(result) - Math.PI) < 1e-9);
});

test('reconciliation error models have stable signs', () => {
  assert.deepEqual(calculatePositionError({ x: 10, y: 2, z: -4 }, { x: 7, y: 1, z: -1 }), { x: 3, y: 1, z: -3 });
  assert.equal(magnitude({ x: 3, y: 4, z: 0 }), 5);
  assert.deepEqual(calculateVisualCorrection({ x: 10, y: 2, z: 1 }, { x: 7, y: 1, z: 4 }), { x: 3, y: 1, z: -3 });
});

test('world manifest is deterministic and validates its hash', () => {
  const manifest = createWorldManifest();
  assert.equal(manifest.hash, getWorldHash());
  assert.equal(applyWorldManifest(manifest), manifest.hash);
  assert.throws(() => applyWorldManifest({ ...manifest, hash: (manifest.hash + 1) >>> 0 }), /hash mismatch/i);
  assert.throws(() => applyWorldManifest({ ...manifest, schemaVersion: manifest.schemaVersion + 1 }), /Unsupported world schema/i);
});
