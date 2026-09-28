// src/ecs/systems/network/ClientReconcileSystem.js

import { STANCE } from '../../../config/index.js';
import { applyFpsMovement } from '../../../utils/Movement.js';
import { calculatePositionError, magnitude, calculateVisualCorrection } from '../../../game/simulation/network/ReconciliationModel.js';

function isNewerTick(next, previous) {
  if (previous == null) return true;
  const delta = (next - previous) >>> 0;
  return delta !== 0 && delta < 0x80000000;
}

function isNewerSequence(next, previous) {
  if (previous == null) return true;
  const delta = (next - previous) >>> 0;
  return delta !== 0 && delta < 0x80000000;
}

/**
 * Authoritative server reconciliation.
 *
 * The client never "partially" trusts an old snapshot. For every newer server
 * tick we rebuild the local predicted state from the authoritative state and
 * replay only inputs the server has not acknowledged. This is the standard
 * client-side prediction model and avoids a prediction/snapshot tug-of-war.
 */
export class ClientReconcileSystem {
  constructor(physicsWorld, inputBuffer) {
    this.physicsWorld = physicsWorld;
    this.inputBuffer = inputBuffer;
    this.lastServerTick = null;
    this.lastAckedSequence = null;
  }

  update(ecsWorld, localEntityOrId, latestSnapshot) {
    if (!localEntityOrId || !latestSnapshot || !this.physicsWorld?.initialized) return false;

    let localEntity =
      typeof localEntityOrId === 'object' && localEntityOrId.player
        ? localEntityOrId
        : null;

    if (!localEntity) {
      for (const entity of ecsWorld.with('player', 'physics', 'transform')) {
        if (entity.player?.isLocal) {
          localEntity = entity;
          break;
        }
      }
    }

    if (!localEntity?.player || !localEntity.physics || !localEntity.transform) return false;

    const serverTick = Number(latestSnapshot.serverTick) >>> 0;
    if (!isNewerTick(serverTick, this.lastServerTick)) return false;
    this.lastServerTick = serverTick;

    const player = localEntity.player;
    const physics = localEntity.physics;
    const transform = localEntity.transform;
    const entities = latestSnapshot.entities || latestSnapshot.players || [];
    const authoritative = entities.find(
      (entry) => (entry.entityId ?? entry.id) === player.id
    );
    if (!authoritative) return false;

    if (authoritative.health !== undefined) {
      player.health = Number(authoritative.health);
      player.isDead = player.health <= 0 || !!authoritative.isDead;
    }

    const ack = Number(
      latestSnapshot.lastAckedSeq ??
      latestSnapshot.lastProcessedSequence ??
      0
    ) >>> 0;

    const frames = this.inputBuffer?.toArray?.() || [];
    const ackFrame = frames.find(
      (frame) => frame && (Number(frame.sequence) >>> 0) === ack
    );

    // A snapshot describes an older point in the simulation. Comparing that
    // position with the player's current predicted position is incorrect:
    // during a jump the player may be several frames ahead vertically, so a
    // perfectly correct prediction would look like a large error every
    // snapshot. Reconcile against the prediction at the ACKed input instead.
    const ackAdvanced =
      this.lastAckedSequence == null ||
      isNewerSequence(ack, this.lastAckedSequence);

    if (!ackAdvanced || !ackFrame?.predictedPosition) {
      // Still update non-positional authoritative state, but never pull the
      // current predicted player toward an older server snapshot.
      if (transform.rotation) {
        transform.rotation.yaw = Number(authoritative.yaw ?? authoritative.rotation?.yaw ?? transform.rotation.yaw ?? 0);
        transform.rotation.pitch = Number(authoritative.pitch ?? authoritative.rotation?.pitch ?? transform.rotation.pitch ?? 0);
      }
      return false;
    }

    const serverPos = {
      x: Number(authoritative.x ?? authoritative.position?.x ?? 0),
      y: Number(authoritative.y ?? authoritative.position?.y ?? 0),
      z: Number(authoritative.z ?? authoritative.position?.z ?? 0),
    };
    const predictedAtAck = ackFrame.predictedPosition;
    const error = calculatePositionError(serverPos, predictedAtAck);
    const errorMagnitude = magnitude(error);

    // Retire acknowledged input only after using its predicted state as the
    // correct comparison point.
    this.inputBuffer.discardUpTo((frame) => {
      if (!frame) return true;
      const seq = Number(frame.sequence) >>> 0;
      return seq === ack || !isNewerSequence(seq, ack);
    });
    this.lastAckedSequence = ack;

    const threshold = 0.12;
    if (errorMagnitude <= threshold) {
      // The server agrees with the historical predicted state. The current
      // player may be ahead because it contains unacknowledged input; leave it
      // completely untouched. This is essential for smooth jumping.
      return false;
    }

    // Preserve the client's current predicted state before replacing it
    // with the authoritative ACK state. This is the baseline for the visual
    // correction after unacknowledged inputs are replayed.
    const predictedCurrent = {
      x: Number(transform.position.x) || 0,
      y: Number(transform.position.y) || 0,
      z: Number(transform.position.z) || 0,
    };

    if (physics.velocity == null) {
      physics.velocity = { x: 0, y: 0, z: 0 };
    }

    if (physics.rigidBody?.setTranslation) {
      physics.rigidBody.setTranslation(serverPos, true);
    }

    transform.position.x = serverPos.x;
    transform.position.y = serverPos.y;
    transform.position.z = serverPos.z;

    if (authoritative.velocity) {
      physics.velocity.x = Number(authoritative.velocity.x) || 0;
      physics.velocity.y = Number(authoritative.velocity.y) || 0;
      physics.velocity.z = Number(authoritative.velocity.z) || 0;
    }
    if (authoritative.isGrounded !== undefined) {
      physics.isGrounded = !!authoritative.isGrounded;
    }

    if (transform.rotation) {
      transform.rotation.yaw = Number(authoritative.yaw ?? authoritative.rotation?.yaw ?? 0);
      transform.rotation.pitch = Number(authoritative.pitch ?? authoritative.rotation?.pitch ?? 0);
    }

    // Replay only input sampled after the acknowledged server state.
    for (const frame of this.inputBuffer?.toArray?.() || []) {
      if (!frame) continue;
      this._reSimulateInputFrame(physics, transform, frame);
    }

    const after = physics.rigidBody?.translation?.() || transform.position;
    const correction = calculateVisualCorrection(predictedCurrent, after);

    if (magnitude(correction) < 4) {
      localEntity.networkVisualCorrection = correction;
    }

    return true;
  }

  _reSimulateInputFrame(physics, transform, inputFrame) {
    const yaw = Number(inputFrame.yaw) || 0;
    const pitch = Number(inputFrame.pitch) || 0;
    const inputMask = Number(inputFrame.inputMask) || 0;
    const stance = inputFrame.stance ?? STANCE.STAND;
    const dt = Number(inputFrame.deltaTime) || 1 / 60;

    if (!physics.velocity) physics.velocity = { x: 0, y: 0, z: 0 };

    physics.isGrounded = applyFpsMovement(
      inputMask,
      yaw,
      physics.velocity,
      physics.isGrounded,
      dt,
      stance
    );

    if (physics.controller && physics.collider && physics.rigidBody) {
      const movementDelta = {
        x: physics.velocity.x * dt,
        y: physics.velocity.y * dt,
        z: physics.velocity.z * dt,
      };

      physics.controller.computeColliderMovement(physics.collider, movementDelta);
      const correctedMovement =
        typeof physics.controller.computedMovement === 'function'
          ? physics.controller.computedMovement()
          : typeof physics.controller.getComputedMovement === 'function'
            ? physics.controller.getComputedMovement()
            : movementDelta;

      const current = physics.rigidBody.translation();
      const next = {
        x: current.x + correctedMovement.x,
        y: current.y + correctedMovement.y,
        z: current.z + correctedMovement.z,
      };

      physics.rigidBody.setTranslation(next, true);

      physics.isGrounded =
        typeof physics.controller.computedGrounded === 'function'
          ? physics.controller.computedGrounded()
          : typeof physics.controller.isGrounded === 'function'
            ? physics.controller.isGrounded()
            : physics.isGrounded;

      transform.position.x = next.x;
      transform.position.y = next.y;
      transform.position.z = next.z;
    }

    if (transform.rotation) {
      transform.rotation.yaw = yaw;
      transform.rotation.pitch = pitch;
    }
  }
}
