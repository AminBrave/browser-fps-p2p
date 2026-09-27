// src/ecs/systems/network/ClientReconcileSystem.js

import { GAME_CONFIG, STANCE } from '../../../config/index.js';
import { applyFpsMovement } from '../../../utils/Movement.js';

/**
 * ClientReconcileSystem (Client-Only)
 * Snaps to host state when error exceeds threshold, then re-simulates
 * unacked inputs with the same camera-relative FPS movement.
 */
export class ClientReconcileSystem {
  constructor(physicsWorld, inputBuffer) {
    this.physicsWorld = physicsWorld;
    this.inputBuffer = inputBuffer;
  }

  update(ecsWorld, localEntityOrId, latestSnapshot) {
    if (!localEntityOrId || !latestSnapshot || !this.physicsWorld) return;

    let localEntity = null;
    if (typeof localEntityOrId === 'object' && localEntityOrId.player) {
      localEntity = localEntityOrId;
    } else {
      for (const entity of ecsWorld.with('player', 'physics', 'transform')) {
        if (entity.player?.isLocal) {
          localEntity = entity;
          break;
        }
      }
    }

    if (!localEntity?.player || !localEntity.physics || !localEntity.transform) return;

    const playerComp = localEntity.player;
    const physComp = localEntity.physics;
    const transformComp = localEntity.transform;

    const snapshotEntities = latestSnapshot.entities || latestSnapshot.players || [];
    const serverPlayerData = snapshotEntities.find(
      (p) => (p.entityId ?? p.id) === playerComp.id
    );
    if (!serverPlayerData) return;

    if (serverPlayerData.health !== undefined) {
      playerComp.health = serverPlayerData.health;
      playerComp.isDead = playerComp.health <= 0;
    }

    const lastAcknowledgedSeq =
      latestSnapshot.lastAckedSeq ??
      latestSnapshot.lastProcessedSequence ??
      0;

    if (this.inputBuffer && this.inputBuffer.size > 0) {
      while (this.inputBuffer.size > 0) {
        const head = typeof this.inputBuffer.peek === 'function' ? this.inputBuffer.peek() : null;
        if (head && head.sequence <= lastAcknowledgedSeq) {
          if (typeof this.inputBuffer.shift === 'function') this.inputBuffer.shift();
          else break;
        } else break;
      }
    }

    const serverPos = {
      x: serverPlayerData.x ?? serverPlayerData.position?.x ?? 0,
      y: serverPlayerData.y ?? serverPlayerData.position?.y ?? 0,
      z: serverPlayerData.z ?? serverPlayerData.position?.z ?? 0,
    };

    const distError = Math.hypot(
      serverPos.x - transformComp.position.x,
      serverPos.y - transformComp.position.y,
      serverPos.z - transformComp.position.z
    );

    const threshold = GAME_CONFIG.RECONCILIATION_THRESHOLD ?? 0.15;

    if (distError > threshold) {
      if (physComp.rigidBody?.setNextKinematicTranslation) {
        physComp.rigidBody.setNextKinematicTranslation(serverPos);
      }
      transformComp.position.x = serverPos.x;
      transformComp.position.y = serverPos.y;
      transformComp.position.z = serverPos.z;

      if (this.inputBuffer?.toArray) {
        const frames = this.inputBuffer.toArray();
        for (let i = 0; i < frames.length; i++) {
          this._reSimulateInputFrame(physComp, transformComp, frames[i]);
        }
      }
    }
  }

  _reSimulateInputFrame(physComp, transformComp, inputFrame) {
    if (!inputFrame) return;
    const { yaw, pitch, inputMask, deltaTime, stance = STANCE.STAND } = inputFrame;
    const dt = deltaTime || 1 / 60;

    if (!physComp.velocity) physComp.velocity = { x: 0, y: 0, z: 0 };

    physComp.isGrounded = applyFpsMovement(
      inputMask || 0,
      yaw || 0,
      physComp.velocity,
      physComp.isGrounded,
      dt,
      stance
    );

    const movementDelta = {
      x: physComp.velocity.x * dt,
      y: physComp.velocity.y * dt,
      z: physComp.velocity.z * dt,
    };

    if (physComp.controller && physComp.collider) {
      physComp.controller.computeColliderMovement(physComp.collider, movementDelta);

      const correctedMovement =
        typeof physComp.controller.computedMovement === 'function'
          ? physComp.controller.computedMovement()
          : typeof physComp.controller.getComputedMovement === 'function'
            ? physComp.controller.getComputedMovement()
            : movementDelta;

      const currentPos = physComp.rigidBody
        ? physComp.rigidBody.translation()
        : transformComp.position;

      const reconciledPos = {
        x: currentPos.x + correctedMovement.x,
        y: currentPos.y + correctedMovement.y,
        z: currentPos.z + correctedMovement.z,
      };

      if (physComp.rigidBody?.setTranslation) {
        // Reconciliation runs from a network callback between simulation ticks.
        // Apply immediately so the next prediction reads the corrected body.
        physComp.rigidBody.setTranslation(reconciledPos, true);
      } else if (physComp.rigidBody?.setNextKinematicTranslation) {
        physComp.rigidBody.setNextKinematicTranslation(reconciledPos);
      }

      physComp.isGrounded =
        typeof physComp.controller.computedGrounded === 'function'
          ? physComp.controller.computedGrounded()
          : typeof physComp.controller.isGrounded === 'function'
            ? physComp.controller.isGrounded()
            : physComp.isGrounded;

      transformComp.position.x = reconciledPos.x;
      transformComp.position.y = reconciledPos.y;
      transformComp.position.z = reconciledPos.z;
    }

    if (transformComp.rotation) {
      transformComp.rotation.yaw = yaw || 0;
      transformComp.rotation.pitch = pitch || 0;
    }

    inputFrame.predictedPosition = { ...transformComp.position };
  }
}
