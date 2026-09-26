// src/ecs/systems/network/HostNetworkSystem.js

import { PACKET_TYPES } from '../../../network/PacketTypes.js';
import { Protocol } from '../../../network/Protocol.js';

/**
 * HostNetworkSystem (Host-Only)
 * Processes incoming client binary inputs, applies them to remote player entities,
 * and serializes/broadcasts full authoritative game state snapshots to all connected peers.
 */
export class HostNetworkSystem {
  /**
   * @param {object} peerManager - The WebRTC PeerManager instance.
   * @param {object} protocol - Protocol utility for binary packet encoding/decoding.
   */
  constructor(peerManager, protocol) {
    this.peerManager = peerManager;
    this.protocol = protocol || Protocol;
    this.incomingInputs = new Map(); // Map<peerId, Array<{inputMask, yaw, pitch, sequence}>>

    this._setupNetworkListeners();
  }

  /**
   * Registers WebRTC data channel event listeners for incoming client packet streams.
   * @private
   */
  _setupNetworkListeners() {
    this.peerManager.onData((peerId, dataView) => {
      const packetType = dataView.getUint8(0);

      if (packetType === PACKET_TYPES.CLIENT_INPUT) {
        const inputData = this.protocol.decodeInput(dataView);
        
        if (!this.incomingInputs.has(peerId)) {
          this.incomingInputs.set(peerId, []);
        }
        this.incomingInputs.get(peerId).push(inputData);
      }
    });
  }

  /**
   * System update loop executed every server tick frame.
   * Consumes queued client input commands and broadcasts world snapshots.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {Array<number>} playerEntities - All active player entity IDs.
   * @param {number} serverTick - Current server simulation tick index.
   */
  update(ecsWorld, playerEntities, serverTick) {
    // 1. Consume and apply incoming client inputs to corresponding player entities
    for (let i = 0; i < playerEntities.length; i++) {
      const entityId = playerEntities[i];
      const playerComp = ecsWorld.getComponent(entityId, 'Player');
      const inputComp = ecsWorld.getComponent(entityId, 'Input');

      if (!playerComp || !inputComp) continue;

      // Skip local host player entity as local InputSystem handles it directly
      if (playerComp.isLocal) continue;

      const queue = this.incomingInputs.get(playerComp.peerId);
      if (queue && queue.length > 0) {
        // Process latest incoming input command from client stream
        const latestInput = queue.shift();
        inputComp.inputMask = latestInput.inputMask;
        inputComp.yaw = latestInput.yaw;
        inputComp.pitch = latestInput.pitch;
        inputComp.sequence = latestInput.sequence;
      }
    }

    // 2. Serialize full authoritative world snapshot state
    const playerSnapshots = [];
    for (let i = 0; i < playerEntities.length; i++) {
      const entityId = playerEntities[i];
      const playerComp = ecsWorld.getComponent(entityId, 'Player');
      const transformComp = ecsWorld.getComponent(entityId, 'Transform');
      const inputComp = ecsWorld.getComponent(entityId, 'Input');

      if (playerComp && transformComp) {
        playerSnapshots.push({
          id: playerComp.id,
          position: transformComp.position,
          rotation: transformComp.rotation,
          health: playerComp.health,
          lastProcessedSequence: inputComp ? inputComp.sequence : 0,
        });
      }
    }

    // Encode world snapshot into compact binary ArrayBuffer
    const snapshotBuffer = this.protocol.encodeSnapshot(serverTick, playerSnapshots);

    // Broadcast snapshot packet to all connected clients over WebRTC DataChannel
    this.peerManager.broadcast(snapshotBuffer);
  }
}