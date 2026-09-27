// src/ecs/systems/network/ClientPredictSystem.js

import { applyFpsMovement } from '../../../utils/Movement.js';
import { STANCE } from '../../../config/index.js';

/**
 * ClientPredictSystem (Client-Only)
 * Immediate local prediction using the same camera-relative FPS movement as the host.
 */
export class ClientPredictSystem {
  /**
   * @param {object} physicsWorld
   * @param {object} inputBuffer
   */
  constructor(physicsWorld, inputBuffer) {
    this.physicsWorld = physicsWorld;
    this.inputBuffer = inputBuffer;
  }

  /**
   * @param {object} ecsWorld
   * @param {object} localEntity
   * @param {number} deltaTime
   */
  update(ecsWorld, localEntity, deltaTime) {
    if (!localEntity || !this.physicsWorld?.initialized) return;

    const playerComp = localEntity.player;
    const physComp = localEntity.physics;
    const transformComp = localEntity.transform;
    const inputComp = localEntity.input;

    if (!physComp || !transformComp || !inputComp) return;
    if (playerComp && playerComp.isDead) return;

    const yaw = inputComp.yaw || 0;
    const pitch = inputComp.pitch || 0;
    const inputMask = inputComp.inputMask || 0;
    const stance = inputComp.stance ?? STANCE.STAND;
    const sequence = inputComp.sequence || 0;
    const dt = deltaTime || 1 / 60;

    if (!physComp.velocity) physComp.velocity = { x: 0, y: 0, z: 0 };

    physComp.isGrounded = applyFpsMovement(
      inputMask,
      yaw,
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

    let predictedPos = {
      x: transformComp.position.x,
      y: transformComp.position.y,
      z: transformComp.position.z,
    };

    if (physComp.controller && physComp.collider && physComp.rigidBody) {
      physComp.controller.computeColliderMovement(physComp.collider, movementDelta);

      const correctedMovement =
        typeof physComp.controller.computedMovement === 'function'
          ? physComp.controller.computedMovement()
          : typeof physComp.controller.getComputedMovement === 'function'
            ? physComp.controller.getComputedMovement()
            : movementDelta;

      const currentPos = physComp.rigidBody.translation();
      predictedPos = {
        x: currentPos.x + correctedMovement.x,
        y: currentPos.y + correctedMovement.y,
        z: currentPos.z + correctedMovement.z,
      };

      physComp.rigidBody.setNextKinematicTranslation(predictedPos);

      physComp.isGrounded =
        typeof physComp.controller.computedGrounded === 'function'
          ? physComp.controller.computedGrounded()
          : typeof physComp.controller.isGrounded === 'function'
            ? physComp.controller.isGrounded()
            : physComp.isGrounded;
    }

    transformComp.position.x = predictedPos.x;
    transformComp.position.y = predictedPos.y;
    transformComp.position.z = predictedPos.z;
    if (transformComp.rotation) {
      transformComp.rotation.yaw = yaw;
      transformComp.rotation.pitch = pitch;
    }

    if (this.inputBuffer && typeof this.inputBuffer.push === 'function') {
      this.inputBuffer.push({
        sequence,
        inputMask,
        yaw,
        pitch,
        deltaTime: dt,
        predictedPosition: { ...predictedPos },
        velocity: { ...physComp.velocity },
        isGrounded: physComp.isGrounded,
      });
    }
  }
}
