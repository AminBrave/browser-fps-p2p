import test from 'node:test';
import assert from 'node:assert/strict';
import { Protocol, CLIENT_INPUT_SIZE, SNAPSHOT_HEADER_SIZE, SNAPSHOT_ENTITY_SIZE } from '../src/network/Protocol.js';
import { PACKET_TYPES } from '../src/network/PacketTypes.js';

test('client input decoder rejects wrong packet types and truncation', () => {
  const valid = Protocol.encodeClientInput(7, 1, 0.5, -0.2, 2, true);
  const decoded = Protocol.decodeClientInput(valid);
  assert.equal(decoded.sequence, 7);
  assert.equal(decoded.inputMask, 1);
  assert.equal(decoded.yaw, 0.5);
  assert.ok(Math.abs(decoded.pitch - (-0.2)) < 1e-7);
  assert.equal(decoded.weaponSlot, 2);
  assert.equal(decoded.isAiming, true);

  const wrongType = valid.slice(0);
  new Uint8Array(wrongType)[0] = PACKET_TYPES.WORLD_SNAPSHOT;
  assert.equal(Protocol.decodeClientInput(wrongType), null);
  assert.equal(Protocol.decodeClientInput(valid.slice(0, CLIENT_INPUT_SIZE - 1)), null);
});

test('join request decoder rejects wrong packet type', () => {
  const packet = Protocol.encodeJoinRequest();
  assert.ok(Protocol.decodeJoinRequest(packet));

  new Uint8Array(packet)[0] = PACKET_TYPES.CLIENT_INPUT;
  assert.equal(Protocol.decodeJoinRequest(packet), null);
});

test('join accept decoder requires the complete fixed packet', () => {
  const packet = Protocol.encodeJoinAccept(2, 123, { x: 1, y: 2, z: 3 });
  assert.ok(Protocol.decodeJoinAccept(packet));
  assert.equal(Protocol.decodeJoinAccept(packet.slice(0, 17)), null);

  new Uint8Array(packet)[0] = PACKET_TYPES.CLIENT_INPUT;
  assert.equal(Protocol.decodeJoinAccept(packet), null);
});

test('world snapshot decoder rejects truncated and oversized entity counts', () => {
  const packet = Protocol.encodeWorldSnapshot(10, 4, [
    { entityId: 1, x: 1, y: 2, z: 3 },
  ]);
  assert.ok(Protocol.decodeWorldSnapshot(packet));

  const truncated = packet.slice(0, packet.byteLength - 1);
  assert.equal(Protocol.decodeWorldSnapshot(truncated), null);

  const malformed = new ArrayBuffer(SNAPSHOT_HEADER_SIZE);
  const view = new DataView(malformed);
  view.setUint8(0, PACKET_TYPES.WORLD_SNAPSHOT);
  view.setUint8(9, 255);
  assert.equal(Protocol.decodeWorldSnapshot(malformed), null);
  assert.equal(SNAPSHOT_ENTITY_SIZE, 45);
});

test('world init rejects malformed declared lengths', () => {
  const packet = Protocol.encodeWorldInit({ world: 'test' });
  const view = new DataView(packet);
  view.setUint32(1, 0xffffffff, true);
  assert.equal(Protocol.decodeWorldInit(packet), null);
});

test('game event rejects malformed declared lengths and wrong packet types', () => {
  const packet = Protocol.encodeGameEvent({ type: 1 });
  const view = new DataView(packet);
  view.setUint32(1, 0xffffffff, true);
  assert.equal(Protocol.decodeGameEvent(packet), null);

  const valid = Protocol.encodeGameEvent({ type: 1 });
  new Uint8Array(valid)[0] = PACKET_TYPES.CLIENT_INPUT;
  assert.equal(Protocol.decodeGameEvent(valid), null);
});

test('snapshot decoder produces plain protocol data', () => {
  const packet = Protocol.encodeWorldSnapshot(11, 9, [
    { entityId: 3, x: 1, y: 2, z: 3, velocity: { x: 4, y: 5, z: 6 } },
  ]);
  const decoded = Protocol.decodeWorldSnapshot(packet);

  assert.equal(decoded.serverTick, 11);
  assert.equal(decoded.lastAckedSeq, 9);
  assert.deepEqual(decoded.entities[0].position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(decoded.entities[0].velocity, { x: 4, y: 5, z: 6 });
});
