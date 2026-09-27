import { PACKET_TYPES } from '../../../network/PacketTypes.js';
import { Protocol } from '../../../network/Protocol.js';
import { GAME_CONFIG, INPUT_FLAGS, NETWORK_CONFIG, STANCE } from '../../../config/index.js';

function isNewerSequence(next, previous) {
  if (previous == null) return true;
  const delta = (next - previous) >>> 0;
  return delta !== 0 && delta < 0x80000000;
}

/**
 * Host-side network adapter.
 * Incoming transport events retain only the newest frame per peer; simulation
 * consumes those frames at the fixed server tick.
 */
export class HostNetworkSystem {
  constructor(peerManager) {
    this.peerManager = peerManager;
    this.incomingInputs = new Map();
    this.lastReceivedSequence = new Map();
    this.serverTick = 0;
    this.lastBroadcastTime = 0;
    this.broadcastIntervalMs = 1000 / Math.max(1, NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE);

    this.peerManager.onData((peerId, dataView) => {
      if (
        dataView.byteLength < 1 ||
        dataView.getUint8(0) !== PACKET_TYPES.CLIENT_INPUT
      ) {
        return;
      }

      const input = Protocol.decodeClientInput(dataView);
      if (!input) return;

      const previous = this.lastReceivedSequence.get(peerId);
      if (!isNewerSequence(input.sequence, previous)) return;

      this.lastReceivedSequence.set(peerId, input.sequence);
      this.incomingInputs.set(peerId, input);

      // Defensive bound in case a PeerJS connection survives while its ECS
      // entity is being removed.
      while (this.incomingInputs.size > GAME_CONFIG.MAX_PLAYERS) {
        const oldestPeer = this.incomingInputs.keys().next().value;
        this.incomingInputs.delete(oldestPeer);
        this.lastReceivedSequence.delete(oldestPeer);
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
        stance: (latest.inputMask & INPUT_FLAGS.PRONE)
          ? STANCE.PRONE
          : (latest.inputMask & INPUT_FLAGS.CROUCH)
            ? STANCE.CROUCH
            : STANCE.STAND,
      });
      this.incomingInputs.delete(player.peerId);
    }
  }

  postUpdate(ecsWorld, currentTime = performance.now()) {
    if (currentTime - this.lastBroadcastTime < this.broadcastIntervalMs) return;
    this.lastBroadcastTime = currentTime;

    // Miniplex queries are iterable but are not guaranteed to expose Array
    // helpers such as .find(). Materialize once because we need both iteration
    // and lookup by peerId below.
    const players = Array.from(ecsWorld.with('player', 'transform', 'input'));
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
        pitch: transform.rotation?.pitch ?? entity.input?.pitch ?? 0,
        health: player.health ?? GAME_CONFIG.MAX_HEALTH,
        stance: entity.input?.stance ?? STANCE.STAND,
        weaponId: entity.weapon?.typeId ?? 1,
        isDead: !!player.isDead,
        isHost: !!player.isHost,
      });
    }

    for (const [peerId, conn] of this.peerManager.connections) {
      if (!conn?.open) continue;

      const peerEntity = players.find(
        (entity) => entity.player?.peerId === peerId
      );
      const ackSequence = peerEntity?.input?.sequence ?? 0;

      this.peerManager.sendTo(
        peerId,
        Protocol.encodeWorldSnapshot(
          this.serverTick,
          ackSequence,
          snapshots
        )
      );
    }
  }

  // Compatibility for callers that still use a single update method.
  update(ecsWorld, currentTime) {
    this.preUpdate(ecsWorld);
    this.postUpdate(ecsWorld, currentTime);
  }

  removePeer(peerId) {
    this.incomingInputs.delete(peerId);
    this.lastReceivedSequence.delete(peerId);
  }
}
