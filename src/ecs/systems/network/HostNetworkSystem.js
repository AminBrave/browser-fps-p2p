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
   * @param {object} peerManager
   * @param {object} [_unused] - kept for call-site compatibility (was physicsWorld)
   */
  constructor(peerManager, _unused) {
    this.peerManager = peerManager;
    this.protocol = Protocol;
    this.incomingInputs = new Map();
    this.serverTick = 0;
    this.lastBroadcastTime = 0;
    this.broadcastIntervalMs = 1000 / 30; // SNAPSHOT_BROADCAST_RATE

    this._setupNetworkListeners();
  }

  _setupNetworkListeners() {
    this.peerManager.onData((peerId, dataView) => {
      const packetType = dataView.getUint8(0);

      if (packetType === PACKET_TYPES.CLIENT_INPUT) {
        const inputData = Protocol.decodeClientInput(dataView);
        if (!this.incomingInputs.has(peerId)) {
          this.incomingInputs.set(peerId, []);
        }
        this.incomingInputs.get(peerId).push(inputData);
      }
    });
  }

  /**
   * @param {object} ecsWorld
   * @param {number} [currentTime]
   */
  update(ecsWorld, currentTime) {
    this.serverTick++;

    const players = ecsWorld.with('player', 'transform', 'input');

    // 1. Apply latest queued inputs to remote players (match by peerId string)
    for (const entity of players) {
      const playerComp = entity.player;
      const inputComp = entity.input;
      if (!playerComp || !inputComp || playerComp.isLocal) continue;

      const queue = this.incomingInputs.get(playerComp.peerId);
      if (queue && queue.length > 0) {
        const latestInput = queue[queue.length - 1];
        queue.length = 0; // drop older frames; keep only latest for this tick
        inputComp.inputMask = latestInput.inputMask;
        inputComp.yaw = latestInput.yaw;
        inputComp.pitch = latestInput.pitch;
        inputComp.sequence = latestInput.sequence;
      }
    }

    // 2. Rate-limit snapshot broadcast
    const now = typeof currentTime === 'number' ? currentTime : performance.now();
    if (now - this.lastBroadcastTime < this.broadcastIntervalMs) {
      return;
    }
    this.lastBroadcastTime = now;

    const playerSnapshots = [];
    let maxAckedSeq = 0;

    for (const entity of players) {
      const playerComp = entity.player;
      const transformComp = entity.transform;
      const inputComp = entity.input;

      if (playerComp && transformComp) {
        playerSnapshots.push({
          entityId: playerComp.id,
          id: playerComp.id,
          x: transformComp.position.x,
          y: transformComp.position.y,
          z: transformComp.position.z,
          position: transformComp.position,
          yaw: transformComp.rotation
            ? transformComp.rotation.yaw ?? transformComp.rotation.y ?? 0
            : 0,
          rotation: transformComp.rotation,
          health: playerComp.health ?? 100,
        });

        if (inputComp && inputComp.sequence > maxAckedSeq) {
          maxAckedSeq = inputComp.sequence;
        }
      }
    }

    const snapshotBuffer = Protocol.encodeWorldSnapshot(
      this.serverTick,
      maxAckedSeq,
      playerSnapshots
    );

    this.peerManager.broadcast(snapshotBuffer);
  }
}
