// src/network/Protocol.js

import { PACKET_TYPES } from './PacketTypes.js';

/**
 * Binary Serialization & Deserialization Protocol
 * Packs and unpacks game networking structures using ArrayBuffers and DataViews 
 * to minimize bandwidth overhead over WebRTC DataChannels.
 */
export class Protocol {
  /**
   * Encodes a Join Request packet.
   * Format: [PacketType: u8]
   * @returns {ArrayBuffer}
   */
  static encodeJoinRequest() {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.JOIN_REQUEST);
    return buffer;
  }

  /**
   * Encodes a Join Accept packet.
   * Format: [PacketType: u8, PlayerId: u8, EntityId: u32]
   * @param {number} playerId 
   * @param {number} entityId 
   * @returns {ArrayBuffer}
   */
  static encodeJoinAccept(playerId, entityId) {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, PACKET_TYPES.JOIN_ACCEPT);
    view.setUint8(1, playerId);
    view.setUint32(2, entityId, true);
    return buffer;
  }

  /**
   * Decodes a Join Accept packet payload.
   * @param {DataView} view 
   * @returns {{ playerId: number, entityId: number }}
   */
  static decodeJoinAccept(view) {
    return {
      playerId: view.getUint8(1),
      entityId: view.getUint32(2, true),
    };
  }

  /**
   * Encodes client input frame.
   * Format: [PacketType: u8, SequenceNum: u32, InputMask: u8, Yaw: f32, Pitch: f32]
   * @param {number} sequence 
   * @param {number} inputMask 
   * @param {number} yaw 
   * @param {number} pitch 
   * @returns {ArrayBuffer}
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
   * Decodes a client input packet payload.
   * @param {DataView} view 
   * @returns {{ sequence: number, inputMask: number, yaw: number, pitch: number }}
   */
  static decodeClientInput(view) {
    return {
      sequence: view.getUint32(1, true),
      inputMask: view.getUint8(5),
      yaw: view.getFloat32(6, true),
      pitch: view.getFloat32(10, true),
    };
  }

  /**
   * Alias for decodeClientInput.
   * @param {DataView} view 
   * @returns {{ sequence: number, inputMask: number, yaw: number, pitch: number }}
   */
  static decodeInput(view) {
    return Protocol.decodeClientInput(view);
  }

  /**
   * Encodes authoritative world state snapshot.
   * Format: [PacketType: u8, ServerTick: u32, LastAckedInputSeq: u32, EntityCount: u8, ...Entities]
   * Entity Format: [EntityId: u32, PosX: f32, PosY: f32, PosZ: f32, Yaw: f32, Health: u8]
   * @param {number} serverTick 
   * @param {number|Array} lastAckedSeqOrEntities - Sequence number OR entities array if 2 args passed.
   * @param {Array} [entitiesList] - Entity state array if 3 args passed.
   * @returns {ArrayBuffer}
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
      view.setUint8(offset + 20, health);
      offset += entitySize;
    }

    return buffer;
  }

  /**
   * Alias for encodeWorldSnapshot.
   * @param {number} serverTick 
   * @param {Array} entities 
   * @returns {ArrayBuffer}
   */
  static encodeSnapshot(serverTick, entities) {
    return Protocol.encodeWorldSnapshot(serverTick, 0, entities);
  }

  /**
   * Decodes a world state snapshot packet payload.
   * @param {DataView} view 
   * @returns {{ serverTick: number, lastAckedSeq: number, entities: Array }}
   */
  static decodeWorldSnapshot(view) {
    const serverTick = view.getUint32(1, true);
    const lastAckedSeq = view.getUint32(5, true);
    const entityCount = view.getUint8(9);

    const entities = [];
    const headerSize = 10;
    const entitySize = 21;

    for (let i = 0; i < entityCount; i++) {
      const offset = headerSize + i * entitySize;
      entities.push({
        entityId: view.getUint32(offset, true),
        x: view.getFloat32(offset + 4, true),
        y: view.getFloat32(offset + 8, true),
        z: view.getFloat32(offset + 12, true),
        yaw: view.getFloat32(offset + 16, true),
        health: view.getUint8(offset + 20),
      });
    }

    return { serverTick, lastAckedSeq, entities };
  }
}