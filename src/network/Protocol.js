import { PACKET_TYPES } from './PacketTypes.js';
import { GAME_CONFIG } from '../config/index.js';

const CLIENT_INPUT_SIZE = 16;
const SNAPSHOT_HEADER_SIZE = 10;
const SNAPSHOT_ENTITY_SIZE = 28;

function asDataView(data) {
  if (data instanceof DataView) return data;
  if (data instanceof ArrayBuffer) return new DataView(data);
  if (ArrayBuffer.isView(data)) {
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

export class Protocol {
  static getPacketType(data) {
    const view = asDataView(data);
    return view && view.byteLength >= 1 ? view.getUint8(0) : 0;
  }

  static encodeJoinRequest() {
    const buffer = new ArrayBuffer(1);
    new DataView(buffer).setUint8(0, PACKET_TYPES.JOIN_REQUEST);
    return buffer;
  }

  static encodeJoinAccept(playerId, entityId, spawn = null) {
    const buffer = new ArrayBuffer(18);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.JOIN_ACCEPT);
    view.setUint8(1, playerId);
    view.setUint32(2, entityId >>> 0, true);
    view.setFloat32(6, Number(spawn?.x ?? 0), true);
    view.setFloat32(10, Number(spawn?.y ?? 0), true);
    view.setFloat32(14, Number(spawn?.z ?? 0), true);
    return buffer;
  }

  static decodeJoinAccept(data) {
    const view = asDataView(data);
    if (!view || view.byteLength < 6) return null;
    return {
      playerId: view.getUint8(1),
      entityId: view.getUint32(2, true),
      spawn: view.byteLength >= 18 ? {
        x: view.getFloat32(6, true),
        y: view.getFloat32(10, true),
        z: view.getFloat32(14, true),
      } : null,
    };
  }

  /**
   * CLIENT_INPUT:
   * [type:u8, sequence:u32, inputMask:u16, yaw:f32, pitch:f32, weaponSlot:i8]
   *
   * u16 is required because CROUCH/PRONE use bits above bit 7.
   */
  static encodeWorldInit(manifest) {
    const payload = new TextEncoder().encode(JSON.stringify(manifest));
    const buffer = new ArrayBuffer(5 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.WORLD_INIT);
    view.setUint32(1, payload.byteLength, true);
    new Uint8Array(buffer, 5).set(payload);
    return buffer;
  }

  static decodeWorldInit(data) {
    const view = asDataView(data);
    if (!view || view.byteLength < 5 || view.getUint8(0) !== PACKET_TYPES.WORLD_INIT) return null;
    const length = view.getUint32(1, true);
    if (length > view.byteLength - 5) return null;
    try {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + 5, length)));
    } catch {
      return null;
    }
  }

  static encodeClientInput(sequence, inputMask, yaw, pitch, weaponSlot = -1) {
    const buffer = new ArrayBuffer(CLIENT_INPUT_SIZE);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.CLIENT_INPUT);
    view.setUint32(1, sequence >>> 0, true);
    view.setUint16(5, inputMask & 0xffff, true);
    view.setFloat32(7, Number.isFinite(yaw) ? yaw : 0, true);
    view.setFloat32(11, Number.isFinite(pitch) ? pitch : 0, true);
    view.setInt8(15, Number.isInteger(weaponSlot) ? weaponSlot : -1);
    return buffer;
  }

  static encodeInput(payloadOrSequence, inputMask, yaw, pitch, weaponSlot = -1) {
    if (payloadOrSequence && typeof payloadOrSequence === 'object') {
      return this.encodeClientInput(
        payloadOrSequence.sequence ?? 0,
        payloadOrSequence.inputMask ?? 0,
        payloadOrSequence.yaw ?? 0,
        payloadOrSequence.pitch ?? 0,
        payloadOrSequence.weaponSlot ?? -1
      );
    }

    return this.encodeClientInput(
      payloadOrSequence ?? 0,
      inputMask ?? 0,
      yaw ?? 0,
      pitch ?? 0,
      weaponSlot
    );
  }

  static decodeClientInput(data) {
    const view = asDataView(data);
    if (!view || view.byteLength < CLIENT_INPUT_SIZE) return null;

    return {
      sequence: view.getUint32(1, true),
      inputMask: view.getUint16(5, true),
      yaw: view.getFloat32(7, true),
      pitch: view.getFloat32(11, true),
      weaponSlot: view.getInt8(15),
    };
  }

  static decodeInput(data) {
    return this.decodeClientInput(data);
  }

  static encodeGameEvent(event = {}) {
    const payload = new TextEncoder().encode(JSON.stringify(event));
    const buffer = new ArrayBuffer(5 + payload.byteLength);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.GAME_EVENT);
    view.setUint32(1, payload.byteLength, true);
    new Uint8Array(buffer, 5).set(payload);
    return buffer;
  }

  static decodeGameEvent(data) {
    const view = asDataView(data);
    if (!view || view.byteLength < 5 || view.getUint8(0) !== PACKET_TYPES.GAME_EVENT) return null;
    const length = view.getUint32(1, true);
    if (length > view.byteLength - 5) return null;
    try {
      return JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(view.buffer, view.byteOffset + 5, length)
        )
      );
    } catch {
      return null;
    }
  }

  static encodeWorldSnapshot(serverTick, lastAckedSeqOrEntities, entitiesList) {
    let lastAckedSeq = 0;
    let entities = [];

    if (Array.isArray(lastAckedSeqOrEntities)) {
      entities = lastAckedSeqOrEntities;
    } else {
      lastAckedSeq = Number(lastAckedSeqOrEntities) >>> 0;
      entities = Array.isArray(entitiesList) ? entitiesList : [];
    }

    const count = Math.min(255, entities.length);
    const buffer = new ArrayBuffer(
      SNAPSHOT_HEADER_SIZE + count * SNAPSHOT_ENTITY_SIZE
    );
    const view = new DataView(buffer);

    view.setUint8(0, PACKET_TYPES.WORLD_SNAPSHOT);
    view.setUint32(1, serverTick >>> 0, true);
    view.setUint32(5, lastAckedSeq, true);
    view.setUint8(9, count);

    for (let i = 0; i < count; i++) {
      const e = entities[i] || {};
      const position = e.position || {};
      const rotation = e.rotation || {};
      const offset = SNAPSHOT_HEADER_SIZE + i * SNAPSHOT_ENTITY_SIZE;

      view.setUint32(offset, (e.entityId ?? e.id ?? 0) >>> 0, true);
      view.setFloat32(offset + 4, Number(e.x ?? position.x ?? 0), true);
      view.setFloat32(offset + 8, Number(e.y ?? position.y ?? 0), true);
      view.setFloat32(offset + 12, Number(e.z ?? position.z ?? 0), true);
      view.setFloat32(
        offset + 16,
        Number(e.yaw ?? rotation.yaw ?? rotation.y ?? 0),
        true
      );
      view.setFloat32(
        offset + 20,
        Number(e.pitch ?? rotation.pitch ?? 0),
        true
      );
      view.setUint8(
        offset + 24,
        Math.max(0, Math.min(255, Number(e.health ?? GAME_CONFIG.MAX_HEALTH) | 0))
      );
      view.setUint8(
        offset + 25,
        Math.max(0, Math.min(255, Number(e.stance ?? 0) | 0))
      );
      view.setUint8(
        offset + 26,
        Math.max(0, Math.min(255, Number(e.weaponId ?? 1) | 0))
      );
      let flags = 0;
      if (e.isDead) flags |= 1;
      if (e.isHost) flags |= 2;
      view.setUint8(offset + 27, flags);
    }

    return buffer;
  }

  static encodeSnapshot(serverTick, entities) {
    return this.encodeWorldSnapshot(serverTick, 0, entities);
  }

  static decodeWorldSnapshot(data) {
    const view = asDataView(data);
    if (!view || view.byteLength < SNAPSHOT_HEADER_SIZE) return null;

    const entityCount = view.getUint8(9);
    const expectedLength =
      SNAPSHOT_HEADER_SIZE + entityCount * SNAPSHOT_ENTITY_SIZE;
    if (view.byteLength < expectedLength) return null;

    const entities = new Array(entityCount);
    for (let i = 0; i < entityCount; i++) {
      const offset = SNAPSHOT_HEADER_SIZE + i * SNAPSHOT_ENTITY_SIZE;
      const entityId = view.getUint32(offset, true);
      const x = view.getFloat32(offset + 4, true);
      const y = view.getFloat32(offset + 8, true);
      const z = view.getFloat32(offset + 12, true);
      const yaw = view.getFloat32(offset + 16, true);
      const pitch = view.getFloat32(offset + 20, true);
      const health = view.getUint8(offset + 24);
      const stance = view.getUint8(offset + 25);
      const weaponId = view.getUint8(offset + 26);
      const flags = view.getUint8(offset + 27);

      entities[i] = {
        entityId,
        id: entityId,
        x,
        y,
        z,
        position: { x, y, z },
        yaw,
        pitch,
        rotation: { yaw, pitch },
        health,
        stance,
        weaponId,
        isDead: !!(flags & 1),
        isHost: !!(flags & 2),
      };
    }

    const lastAckedSeq = view.getUint32(5, true);
    return {
      serverTick: view.getUint32(1, true),
      lastAckedSeq,
      lastProcessedSequence: lastAckedSeq,
      entities,
      players: entities,
      timestamp: performance.now(),
    };
  }

  static decodeSnapshot(data) {
    return this.decodeWorldSnapshot(data);
  }
}

export { CLIENT_INPUT_SIZE, SNAPSHOT_HEADER_SIZE, SNAPSHOT_ENTITY_SIZE };
