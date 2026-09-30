import { PACKET_TYPES, EVENT_TYPES } from '../../../network/PacketTypes.js';
import { Protocol } from '../../../network/Protocol.js';
import { GAME_CONFIG, INPUT_FLAGS, NETWORK_CONFIG, PROTOCOL_CONFIG, STANCE } from '../../../config/index.js';
import { validateClientInput } from '../../../network/InputValidator.js';
import { isNewerSequence } from '../../../network/Sequence.js';

const CONTINUOUS_INPUT_MASK =
  INPUT_FLAGS.FORWARD |
  INPUT_FLAGS.BACKWARD |
  INPUT_FLAGS.LEFT |
  INPUT_FLAGS.RIGHT |
  INPUT_FLAGS.SPRINT |
  INPUT_FLAGS.CROUCH |
  INPUT_FLAGS.PRONE |
  INPUT_FLAGS.SHOOT;

export class HostNetworkSystem {
  constructor(peerTransport) {
    this.peerTransport = peerTransport;
    this.incomingInputs = new Map();
    this.lastReceivedSequence = new Map();
    this.lastProcessedSequence = new Map();
    this.lastInputByPeer = new Map();
    this.peerTickOffset = new Map();
    this.incomingGameEvents = new Map();
    this.maxGameEventsPerPeer = NETWORK_CONFIG.MAX_GAME_EVENT_QUEUE;
    this.serverTick = 0;
    this.lastBroadcastTime = 0;
    this.broadcastIntervalMs = 1000 / Math.max(1, NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE);
    this.onJoinRequest = null;

    this.peerTransport.onData((peerId, dataView) => {
      if (dataView.byteLength < 1) return;
      const packetType = dataView.getUint8(0);

      if (packetType === PACKET_TYPES.JOIN_REQUEST) {
        const request = Protocol.decodeJoinRequest(dataView);
        if (!request || request.protocolVersion !== PROTOCOL_CONFIG.PROTOCOL_VERSION) {
          console.warn('[Network] Rejecting incompatible client protocol', {
            peerId, protocolVersion: request?.protocolVersion,
          });
          return;
        }
        this.onJoinRequest?.(peerId);
        return;
      }

      if (packetType === PACKET_TYPES.GAME_EVENT) {
        const event = Protocol.decodeGameEvent(dataView);
        if (event?.type === EVENT_TYPES.SFX) {
          const queue = this.incomingGameEvents.get(peerId) || [];
          if (queue.length >= this.maxGameEventsPerPeer) {
            this._rejectPeer(peerId, 'game event backlog overflow');
            return;
          }
          queue.push(event);
          this.incomingGameEvents.set(peerId, queue);
        }
        return;
      }

      if (packetType !== PACKET_TYPES.CLIENT_INPUT) return;

      const decodedInput = Protocol.decodeClientInput(dataView);
      const input = validateClientInput(decodedInput);
      if (!input) {
        this._rejectPeer(peerId, 'invalid client input');
        return;
      }

      const previous = this.lastReceivedSequence.get(peerId);
      if (!isNewerSequence(input.sequence, previous)) return;

      if (!this.peerTickOffset.has(peerId)) {
        this.peerTickOffset.set(peerId, this.serverTick - input.sequence);
      }
      const tickOffset = this.peerTickOffset.get(peerId);
      input.authoritativeTick = (input.sequence + tickOffset) >>> 0;

      this.lastReceivedSequence.set(peerId, input.sequence);
      const queue = this.incomingInputs.get(peerId) || [];
      if (queue.length >= NETWORK_CONFIG.MAX_INPUT_QUEUE) {
        this._rejectPeer(peerId, 'input backlog overflow');
        return;
      }
      queue.push(input);
      this.incomingInputs.set(peerId, queue);
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
      const last = this.lastInputByPeer.get(player.peerId);

      // Missing input is not treated as a zero-state teleport. Continuous
      // controls are held for one tick; edge-triggered controls are cleared.
      const applied = next || (last ? {
        ...last,
        inputMask: last.inputMask & CONTINUOUS_INPUT_MASK,
        weaponSlot: -1,
        isSynthetic: true,
      } : null);
      if (!applied) continue;

      Object.assign(input, {
        inputMask: applied.inputMask,
        yaw: applied.yaw,
        pitch: applied.pitch,
        sequence: applied.sequence,
        weaponSlot: applied.weaponSlot,
        isAiming: !!applied.isAiming,
        stance: (applied.inputMask & INPUT_FLAGS.PRONE)
          ? STANCE.PRONE
          : (applied.inputMask & INPUT_FLAGS.CROUCH)
            ? STANCE.CROUCH
            : STANCE.STAND,
        authoritativeTick: applied.authoritativeTick ?? this.serverTick,
        isSynthetic: !!applied.isSynthetic,
      });
      if (next) {
        this.lastInputByPeer.set(player.peerId, next);
        this.lastProcessedSequence.set(player.peerId, next.sequence);
      }
    }
  }

  postUpdate(ecsWorld, currentTime = performance.now()) {
    if (currentTime - this.lastBroadcastTime < this.broadcastIntervalMs) return;
    this.lastBroadcastTime = currentTime;

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
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        isHost: !!player.isHost,
        isAiming: !!entity.input?.isAiming,
      });
    }

    for (const peerId of this.peerTransport.getPeerIds()) {
      if (!this.peerTransport.isConnected(peerId)) continue;
      const ackSequence = this.lastProcessedSequence.get(peerId) ?? 0;
      this.peerTransport.sendTo(peerId, Protocol.encodeWorldSnapshot(this.serverTick, ackSequence, snapshots));
    }
  }

  _rejectPeer(peerId, reason) {
    console.warn('[Network] Rejecting peer:', peerId, reason);
    this.removePeer(peerId);
    this.peerTransport.closePeer(peerId);
  }

  setJoinHandler(callback) {
    this.onJoinRequest = typeof callback === 'function' ? callback : null;
  }

  update(ecsWorld, currentTime) {
    this.preUpdate(ecsWorld);
    this.postUpdate(ecsWorld, currentTime);
  }

  emitGameEvent(event) {
    this.peerTransport.broadcast(Protocol.encodeGameEvent(event));
  }

  removePeer(peerId) {
    this.incomingInputs.delete(peerId);
    this.incomingGameEvents.delete(peerId);
    this.lastReceivedSequence.delete(peerId);
    this.lastProcessedSequence.delete(peerId);
    this.lastInputByPeer.delete(peerId);
    this.peerTickOffset.delete(peerId);
  }
}
