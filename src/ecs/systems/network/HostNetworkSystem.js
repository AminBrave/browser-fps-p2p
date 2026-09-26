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
   * @param {object} [protocol] - Protocol utility for binary packet encoding/decoding.
   */
  constructor(peerManager, protocol) {
    this.peerManager = peerManager;
    this.protocol = protocol || Protocol;
    this.incomingInputs = new Map(); // Map<peerId, Array<{inputMask, yaw, pitch, sequence}>>
    this.serverTick = 0;

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
        // Support both decodeClientInput and decodeInput aliases
        const decodeMethod = this.protocol.decodeClientInput 
          || this.protocol.decodeInput 
          || Protocol.decodeClientInput;
          
        const inputData = decodeMethod.call(this.protocol, dataView);
        
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
   * @param {object} ecsWorld - The Miniplex ECS world instance.
   * @param {number} [currentTime] - Current performance frame timestamp or server tick.
   */
  update(ecsWorld, currentTime) {
    this.serverTick++;

    // Query active player entities in Miniplex v2
    const players = ecsWorld.with('player', 'transform', 'input');

    // 1. Consume and apply incoming client inputs to corresponding remote player entities
    for (const entity of players) {
      const playerComp = entity.player;
      const inputComp = entity.input;

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
    let maxAckedSeq = 0;

    for (const entity of players) {
      const playerComp = entity.player;
      const transformComp = entity.transform;
      const inputComp = entity.input;

      if (playerComp && transformComp) {
        playerSnapshots.push({
          entityId: playerComp.id || 1,
          id: playerComp.id || 1,
          x: transformComp.position.x,
          y: transformComp.position.y,
          z: transformComp.position.z,
          position: transformComp.position,
          yaw: transformComp.rotation ? transformComp.rotation.y || transformComp.rotation.yaw : 0,
          rotation: transformComp.rotation,
          health: playerComp.health || 100,
        });

        if (inputComp && inputComp.sequence > maxAckedSeq) {
          maxAckedSeq = inputComp.sequence;
        }
      }
    }

    // Resolve encode method across Protocol class variants
    const encodeMethod = this.protocol.encodeWorldSnapshot 
      || this.protocol.encodeSnapshot 
      || Protocol.encodeWorldSnapshot;

    // Encode world snapshot into binary ArrayBuffer
    const snapshotBuffer = encodeMethod.call(
      this.protocol,
      this.serverTick,
      maxAckedSeq,
      playerSnapshots
    );

    // Broadcast snapshot packet to all connected clients over WebRTC DataChannel
    this.peerManager.broadcast(snapshotBuffer);
  }
}