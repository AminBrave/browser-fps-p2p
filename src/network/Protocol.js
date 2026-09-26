// src/network/Protocol.js

import { PACKET_TYPES } from './PacketTypes.js';

/**
 * Binary Serialization & Deserialization Protocol
 * Packs and unpacks game networking structures using ArrayBuffers and DataViews
 * to minimize bandwidth overhead over WebRTC DataChannels.
 */
export class Protocol {
  /**
   * Read packet type byte from ArrayBuffer or DataView.
   * @param {ArrayBuffer|DataView} data
   * @returns {number}
   */
  static getPacketType(data) {
    if (data instanceof DataView) {
      return data.getUint8(0);
    }
    if (data instanceof ArrayBuffer) {
      return new DataView(data).getUint8(0);
    }
    return 0;
  }

  static encodeJoinRequest() {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.JOIN_REQUEST);
    return buffer;
  }

  static encodeJoinAccept(playerId, entityId) {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.JOIN_ACCEPT);
    view.setUint8(1, playerId);
    view.setUint32(2, entityId, true);
    return buffer;
  }

  static decodeJoinAccept(view) {
    return {
      playerId: view.getUint8(1),
      entityId: view.getUint32(2, true),
    };
  }

  /**
   * Encodes client input frame.
   * Format: [PacketType: u8, SequenceNum: u32, InputMask: u8, Yaw: f32, Pitch: f32]
   */
  static encodeClientInput(sequence, inputMask, yaw, pitch) {
    const buffer = new ArrayBuffer(14);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.CLIENT_INPUT);
    view.setUint32(1, sequence, true);
    view.setUint8(5, inputMask);
    view.setFloat32(6, yaw, true);
    view.setFloat32(10, pitch, true);
    return buffer;
  }

  /**
   * Object-form alias used by ClientGame: Protocol.encodeInput(inputPayload)
   * @param {{ sequence: number, inputMask: number, yaw: number, pitch: number }} payload
   * @returns {ArrayBuffer}
   */
  static encodeInput(payload) {
    if (payload && typeof payload === 'object') {
      return Protocol.encodeClientInput(
        payload.sequence ?? 0,
        payload.inputMask ?? 0,
        payload.yaw ?? 0,
        payload.pitch ?? 0
      );
    }
    // Fallback positional args if someone calls encodeInput(seq, mask, yaw, pitch)
    return Protocol.encodeClientInput(
      arguments[0] ?? 0,
      arguments[1] ?? 0,
      arguments[2] ?? 0,
      arguments[3] ?? 0
    );
  }

  static decodeClientInput(view) {
    const v = view instanceof DataView ? view : new DataView(view);
    return {
      sequence: v.getUint32(1, true),
      inputMask: v.getUint8(5),
      yaw: v.getFloat32(6, true),
      pitch: v.getFloat32(10, true),
    };
  }

  static decodeInput(view) {
    return Protocol.decodeClientInput(view);
  }

  /**
   * Encodes authoritative world state snapshot.
   * Format: [PacketType: u8, ServerTick: u32, LastAckedInputSeq: u32, EntityCount: u8, ...Entities]
   * Entity: [EntityId: u32, PosX: f32, PosY: f32, PosZ: f32, Yaw: f32, Health: u8]
   */
  static encodeWorldSnapshot(serverTick, lastAckedSeqOrEntities, entitiesList) {
    let lastAckedSeq = 0;
    let entities = [];

    if (Array.isArray(lastAckedSeqOrEntities)) {
      entities = lastAckedSeqOrEntities;
    } else {
      lastAckedSeq = lastAckedSeqOrEntities || 0;
      entities = entitiesList || [];
    }

    const headerSize = 10;
    const entitySize = 21;
    const buffer = new ArrayBuffer(headerSize + entities.length * entitySize);
    const view = new DataView(buffer);

    view.setUint8(0, PACKET_TYPES.WORLD_SNAPSHOT);
    view.setUint32(1, serverTick, true);
    view.setUint32(5, lastAckedSeq, true);
    view.setUint8(9, entities.length);

    let offset = headerSize;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const entityId = e.entityId || e.id || 0;
      const posX = e.x !== undefined ? e.x : (e.position?.x || 0);
      const posY = e.y !== undefined ? e.y : (e.position?.y || 0);
      const posZ = e.z !== undefined ? e.z : (e.position?.z || 0);
      const yaw = e.yaw !== undefined ? e.yaw : (e.rotation?.yaw || e.rotation?.y || 0);
      const health = e.health !== undefined ? e.health : 100;

      view.setUint32(offset, entityId, true);
      view.setFloat32(offset + 4, posX, true);
      view.setFloat32(offset + 8, posY, true);
      view.setFloat32(offset + 12, posZ, true);
      view.setFloat32(offset + 16, yaw, true);
      view.setUint8(offset + 20, Math.max(0, Math.min(255, health | 0)));
      offset += entitySize;
    }

    return buffer;
  }

  static encodeSnapshot(serverTick, entities) {
    return Protocol.encodeWorldSnapshot(serverTick, 0, entities);
  }

  /**
   * Decodes a world state snapshot. Accepts DataView or ArrayBuffer.
   * Adds `timestamp` (client receive time) and `players` alias for interpolator.
   */
  static decodeWorldSnapshot(data) {
    const view = data instanceof DataView ? data : new DataView(data);
    const serverTick = view.getUint32(1, true);
    const lastAckedSeq = view.getUint32(5, true);
    const entityCount = view.getUint8(9);

    const entities = [];
    const headerSize = 10;
    const entitySize = 21;

    for (let i = 0; i < entityCount; i++) {
      const offset = headerSize + i * entitySize;
      const entityId = view.getUint32(offset, true);
      const x = view.getFloat32(offset + 4, true);
      const y = view.getFloat32(offset + 8, true);
      const z = view.getFloat32(offset + 12, true);
      const yaw = view.getFloat32(offset + 16, true);
      const health = view.getUint8(offset + 20);
      entities.push({
        entityId,
        id: entityId,
        x,
        y,
        z,
        position: { x, y, z },
        yaw,
        rotation: { yaw, pitch: 0 },
        health,
      });
    }

    return {
      serverTick,
      lastAckedSeq,
      lastProcessedSequence: lastAckedSeq,
      entities,
      players: entities, // alias for InterpolationSystem / ClientGame
      timestamp: performance.now(),
    };
  }

  static decodeSnapshot(data) {
    return Protocol.decodeWorldSnapshot(data);
  }
}
