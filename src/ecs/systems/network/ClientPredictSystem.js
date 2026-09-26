// src/ecs/systems/network/ClientPredictSystem.js

import { GAME_CONFIG, INPUT_FLAGS } from '../../../config/constants.js';
import { hasFlag } from '../../../utils/BitFlags.js';

/**
 * ClientPredictSystem (Client-Only)
 * Executes immediate local prediction for the local player entity using unacknowledged inputs,
 * pushing each prediction snapshot into a ring buffer for server reconciliation.
 *
 * Uses Miniplex v2 entity objects (not getComponent + entity IDs).
 */
export class ClientPredictSystem {
  /**
   * @param {object} physicsWorld - Rapier3D physics world wrapper instance.
   * @param {object} inputBuffer - CircularBuffer holding unacknowledged input frames.
   */
  constructor(physicsWorld, inputBuffer) {
    this.physicsWorld = physicsWorld;
    this.inputBuffer = inputBuffer;
  }

  /**
   * @param {object} ecsWorld
   * @param {object} localEntity - Miniplex entity object (or null)
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
    const sequence = inputComp.sequence || 0;
    const dt = deltaTime || (1 / 60);

    let moveX = 0;
    let moveZ = 0;

    if (hasFlag(inputMask, INPUT_FLAGS.FORWARD)) moveZ -= 1;
    if (hasFlag(inputMask, INPUT_FLAGS.BACKWARD)) moveZ += 1;
    if (hasFlag(inputMask, INPUT_FLAGS.LEFT)) moveX -= 1;
    if (hasFlag(inputMask, INPUT_FLAGS.RIGHT)) moveX += 1;

    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const worldMoveX = moveX * cosYaw - moveZ * sinYaw;
    const worldMoveZ = moveX * sinYaw + moveZ * cosYaw;

    const speed = GAME_CONFIG.PLAYER_SPEED || 8.0;
    if (!physComp.velocity) physComp.velocity = { x: 0, y: 0, z: 0 };
    physComp.velocity.x = worldMoveX * speed;
    physComp.velocity.z = worldMoveZ * speed;

    if (physComp.isGrounded) {
      physComp.velocity.y = -0.1;
      if (hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
        physComp.velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE || 6.5;
        physComp.isGrounded = false;
      }
    } else {
      physComp.velocity.y += (GAME_CONFIG.GRAVITY || -19.62) * dt;
    }

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
            : true;
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
