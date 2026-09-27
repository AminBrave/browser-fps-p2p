import { PACKET_TYPES, EVENT_TYPES } from '../../../network/PacketTypes.js';
import { Protocol } from '../../../network/Protocol.js';
import { GAME_CONFIG, INPUT_FLAGS, NETWORK_CONFIG, STANCE } from '../../../config/index.js';

function isNewerSequence(next, previous) {
  if (previous == null) return true;
  const delta = (next - previous) >>> 0;
  return delta !== 0 && delta < 0x80000000;
}

/**
 * Host-side network adapter.
 * Transport preserves ordered input frames; simulation consumes exactly one
 * frame per authoritative server tick so acknowledgements match replay.
 */
export class HostNetworkSystem {
  constructor(peerManager) {
    this.peerManager = peerManager;
    this.incomingInputs = new Map();
    this.lastReceivedSequence = new Map();
    this.lastProcessedSequence = new Map();
    this.incomingGameEvents = new Map();
    this.serverTick = 0;
    this.lastBroadcastTime = 0;
    this.broadcastIntervalMs = 1000 / Math.max(1, NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE);

    this.peerManager.onData((peerId, dataView) => {
      if (dataView.byteLength < 1) return;

      const packetType = dataView.getUint8(0);
      if (packetType === PACKET_TYPES.GAME_EVENT) {
        const event = Protocol.decodeGameEvent(dataView);
        if (event?.type === EVENT_TYPES.SFX) {
          const queue = this.incomingGameEvents.get(peerId) || [];
          queue.push(event);
          this.incomingGameEvents.set(peerId, queue);
        }
        return;
      }

      if (packetType !== PACKET_TYPES.CLIENT_INPUT) return;

      const input = Protocol.decodeClientInput(dataView);
      if (!input) return;

      const previous = this.lastReceivedSequence.get(peerId);
      if (!isNewerSequence(input.sequence, previous)) return;

      this.lastReceivedSequence.set(peerId, input.sequence);
      const queue = this.incomingInputs.get(peerId) || [];
      queue.push(input);
      this.incomingInputs.set(peerId, queue);

      // Defensive bound in case a PeerJS connection survives while its ECS
      // entity is being removed.
      // Never discard an input that has not been simulated. The snapshot ACK
      // is the authoritative boundary used by client reconciliation; dropping
      // a frame here would make the client replay a different input history.
    });
  }

  preUpdate(ecsWorld) {
    this.serverTick++;

    for (const [peerId, queue] of this.incomingGameEvents) {
      if (!queue?.length) continue;
      const entity = Array.from(ecsWorld.with('player')).find(
        (candidate) => candidate.player?.peerId === peerId
      );
      while (queue.length) {
        const event = queue.shift();
        if (!entity?.player || entity.player.isDead) continue;
        this.emitGameEvent({
          ...event,
          sourceId: entity.player.id,
          position: event.position || { ...entity.transform.position },
        });
      }
    }

    for (const entity of ecsWorld.with('player', 'transform', 'input')) {
      const player = entity.player;
      const input = entity.input;
      if (!player || !input || player.isLocal) continue;

      const queue = this.incomingInputs.get(player.peerId);
      const next = queue?.shift();
      if (!next) continue;

      Object.assign(input, {
        inputMask: next.inputMask,
        yaw: next.yaw,
        pitch: next.pitch,
        sequence: next.sequence,
        weaponSlot: next.weaponSlot,
        stance: (next.inputMask & INPUT_FLAGS.PRONE)
          ? STANCE.PRONE
          : (next.inputMask & INPUT_FLAGS.CROUCH)
            ? STANCE.CROUCH
            : STANCE.STAND,
      });
      this.lastProcessedSequence.set(player.peerId, next.sequence);
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
        velocity: entity.physics?.velocity ? { ...entity.physics.velocity } : { x: 0, y: 0, z: 0 },
        isGrounded: entity.physics?.isGrounded !== false,
        isDead: !!player.isDead,
        isHost: !!player.isHost,
      });
    }

    for (const [peerId, conn] of this.peerManager.connections) {
      if (!conn?.open) continue;

      const peerEntity = players.find(
        (entity) => entity.player?.peerId === peerId
      );
      const ackSequence = this.lastProcessedSequence.get(peerId) ?? 0;

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

  emitGameEvent(event) {
    const packet = Protocol.encodeGameEvent(event);
    this.peerManager.broadcast(packet);
  }

  removePeer(peerId) {
    this.incomingInputs.delete(peerId);
    this.incomingGameEvents.delete(peerId);
    this.lastReceivedSequence.delete(peerId);
    this.lastProcessedSequence.delete(peerId);
  }
}
