import { PACKET_TYPES } from '../../../network/PacketTypes.js';
import { Protocol } from '../../../network/Protocol.js';

const MAX_PENDING_PEERS = 32;

function isNewerSequence(next, previous) {
  if (previous == null) return true;
  const delta = (next - previous) >>> 0;
  return delta !== 0 && delta < 0x80000000;
}

/**
 * Host-side transport adapter.
 *
 * Network callbacks only retain the newest input per peer. The simulation
 * consumes that value at a fixed tick, so a stalled client cannot grow an
 * unbounded input queue.
 */
export class HostNetworkSystem {
  constructor(peerManager) {
    this.peerManager = peerManager;
    this.incomingInputs = new Map();
    this.lastReceivedSequence = new Map();
    this.serverTick = 0;
    this.lastBroadcastTime = 0;
    this.broadcastIntervalMs = 1000 / 30;

    this._setupNetworkListeners();
  }

  _setupNetworkListeners() {
    this.peerManager.onData((peerId, dataView) => {
      if (dataView.byteLength < 1 || dataView.getUint8(0) !== PACKET_TYPES.CLIENT_INPUT) {
        return;
      }

      const inputData = Protocol.decodeClientInput(dataView);
      if (!inputData) return;

      const previous = this.lastReceivedSequence.get(peerId);
      if (!isNewerSequence(inputData.sequence, previous)) return;

      // One pending frame per peer: stale frames are never allowed to pile up.
      this.lastReceivedSequence.set(peerId, inputData.sequence);
      this.incomingInputs.set(peerId, inputData);

      if (this.incomingInputs.size > MAX_PENDING_PEERS) {
        const oldestPeer = this.incomingInputs.keys().next().value;
        if (oldestPeer != null) {
          this.incomingInputs.delete(oldestPeer);
          this.lastReceivedSequence.delete(oldestPeer);
        }
      }
    });
  }

  preUpdate(ecsWorld) {
    this.serverTick++;

    for (const entity of ecsWorld.with('player', 'transform', 'input')) {
      const player = entity.player;
      const input = entity.input;
      if (!player || !input || player.isLocal) continue;

      const latest = this.incomingInputs.get(player.peerId);
      if (!latest) continue;

      Object.assign(input, {
        inputMask: latest.inputMask,
        yaw: latest.yaw,
        pitch: latest.pitch,
        sequence: latest.sequence,
        weaponSlot: latest.weaponSlot,
      });
      this.incomingInputs.delete(player.peerId);
    }
  }

  postUpdate(ecsWorld, currentTime = performance.now()) {
    if (currentTime - this.lastBroadcastTime < this.broadcastIntervalMs) return;
    this.lastBroadcastTime = currentTime;

    const players = ecsWorld.with('player', 'transform', 'input');
    const snapshots = [];

    for (const entity of players) {
      const player = entity.player;
      const transform = entity.transform;
      if (!player || !transform) continue;

      snapshots.push({
        entityId: player.id,
        id: player.id,
        x: transform.position.x,
        y: transform.position.y,
        z: transform.position.z,
        yaw: transform.rotation?.yaw ?? transform.rotation?.y ?? 0,
        health: player.health ?? 100,
      });
    }

    // The acknowledgement is connection-specific. Using one global maximum
    // would incorrectly acknowledge another client's inputs.
    for (const [peerId, conn] of this.peerManager.connections) {
      if (!conn?.open) continue;

      const peerEntity = snapshots.find((snapshot) =>
        players.some(
          (entity) =>
            entity.player?.peerId === peerId &&
            entity.player?.id === snapshot.entityId
        )
      );

      const ackSequence =
        peerEntity
          ? players.find(
              (entity) =>
                entity.player?.peerId === peerId &&
                entity.player?.id === peerEntity.entityId
            )?.input?.sequence ?? 0
          : 0;

      this.peerManager.sendTo(
        peerId,
        Protocol.encodeWorldSnapshot(this.serverTick, ackSequence, snapshots)
      );
    }
  }

  // Backward-compatible entry point for external callers.
  update(ecsWorld, currentTime) {
    this.preUpdate(ecsWorld);
    this.postUpdate(ecsWorld, currentTime);
  }

  removePeer(peerId) {
    this.incomingInputs.delete(peerId);
    this.lastReceivedSequence.delete(peerId);
  }
}
