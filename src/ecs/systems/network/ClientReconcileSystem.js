// src/ecs/systems/network/ClientReconcileSystem.js

import { STANCE } from '../../../config/index.js';
import { applyFpsMovement } from '../../../utils/Movement.js';

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
    if (!localEntityOrId || !latestSnapshot || !this.physicsWorld?.initialized) return;

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

    if (!localEntity?.player || !localEntity.physics || !localEntity.transform) return;

    const serverTick = Number(latestSnapshot.serverTick) >>> 0;
    if (!isNewerTick(serverTick, this.lastServerTick)) return;
    this.lastServerTick = serverTick;

    const player = localEntity.player;
    const physics = localEntity.physics;
    const transform = localEntity.transform;
    const entities = latestSnapshot.entities || latestSnapshot.players || [];
    const authoritative = entities.find(
      (entry) => (entry.entityId ?? entry.id) === player.id
    );
    if (!authoritative) return;

    if (authoritative.health !== undefined) {
      player.health = Number(authoritative.health);
      player.isDead = player.health <= 0 || !!authoritative.isDead;
    }

    const ack = Number(
      latestSnapshot.lastAckedSeq ??
      latestSnapshot.lastProcessedSequence ??
      0
    ) >>> 0;

    // A snapshot can arrive every network tick even when it has not processed
    // any new input. Acknowledgement, not snapshot arrival, is the prediction
    // timeline boundary.
    let ackAdvanced = false;
    if (
      this.inputBuffer &&
      this.inputBuffer.size > 0 &&
      (this.lastAckedSequence == null || isNewerSequence(ack, this.lastAckedSequence))
    ) {
      this.inputBuffer.discardUpTo((frame) => {
        if (!frame) return true;
        const seq = Number(frame.sequence) >>> 0;
        return seq === ack || !isNewerSequence(seq, ack);
      });
      this.lastAckedSequence = ack;
      ackAdvanced = true;
    }

    const body = physics.rigidBody;
    const current = body?.translation?.() || transform.position;
    const serverPos = {
      x: Number(authoritative.x ?? authoritative.position?.x ?? 0),
      y: Number(authoritative.y ?? authoritative.position?.y ?? 0),
      z: Number(authoritative.z ?? authoritative.position?.z ?? 0),
    };

    const error = {
      x: serverPos.x - current.x,
      y: serverPos.y - current.y,
      z: serverPos.z - current.z,
    };
    const errorMagnitude = Math.hypot(error.x, error.y, error.z);
    const threshold = 0.12;

    // Do not teleport the local player on every snapshot. Small differences
    // are normal network/prediction drift and must remain entirely invisible.
    // Only a meaningful divergence causes a simulation rewind.
    if (errorMagnitude > threshold) {
      if (body?.setTranslation) body.setTranslation(serverPos, true);

      transform.position.x = serverPos.x;
      transform.position.y = serverPos.y;
      transform.position.z = serverPos.z;

      if (!physics.velocity) physics.velocity = { x: 0, y: 0, z: 0 };
      if (authoritative.velocity) {
        physics.velocity.x = Number(authoritative.velocity.x) || 0;
        physics.velocity.y = Number(authoritative.velocity.y) || 0;
        physics.velocity.z = Number(authoritative.velocity.z) || 0;
      }
      physics.isGrounded =
        authoritative.isGrounded !== undefined
          ? !!authoritative.isGrounded
          : physics.isGrounded;

      if (transform.rotation) {
        transform.rotation.yaw = Number(authoritative.yaw ?? authoritative.rotation?.yaw ?? 0);
        transform.rotation.pitch = Number(authoritative.pitch ?? authoritative.rotation?.pitch ?? 0);
      }

      // Replay only the still-unacknowledged input frames. These are already
      // ordered in the same chronological order in which the client sampled
      // them.
      for (const frame of this.inputBuffer?.toArray?.() || []) {
        if (!frame) continue;
        this._reSimulateInputFrame(physics, transform, frame);
      }

      const after = body?.translation?.() || transform.position;
      const correction = {
        x: current.x - after.x,
        y: current.y - after.y,
        z: current.z - after.z,
      };

      // RenderSystem decays this visual-only offset over subsequent frames,
      // so a genuine correction is visible as a smooth blend instead of a
      // camera teleport.
      if (Math.hypot(correction.x, correction.y, correction.z) < 4) {
        localEntity.networkVisualCorrection = correction;
      }
    } else if (ackAdvanced) {
      // The server has confirmed inputs that the client already predicted
      // correctly. Keep the predicted body exactly where it is; rewriting it
      // here would create the characteristic one-frame jitter.
      transform.position.x = current.x;
      transform.position.y = current.y;
      transform.position.z = current.z;
    }

    // Server orientation/health are authoritative, but position remains
    // client-predicted until an actual positional divergence requires a
    // rewind.
    if (transform.rotation) {
      transform.rotation.yaw = Number(authoritative.yaw ?? authoritative.rotation?.yaw ?? transform.rotation.yaw ?? 0);
      transform.rotation.pitch = Number(authoritative.pitch ?? authoritative.rotation?.pitch ?? transform.rotation.pitch ?? 0);
    }
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
