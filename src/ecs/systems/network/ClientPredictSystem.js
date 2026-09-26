// src/ecs/systems/network/ClientPredictSystem.js

import { GAME_CONFIG } from '../../../config/constants.js';
import { hasFlag } from '../../../utils/BitFlags.js';
import { INPUT_FLAGS } from '../../../config/constants.js';

/**
 * ClientPredictSystem (Client-Only)
 * Executes immediate local prediction for the local player entity using unacknowledged inputs,
 * pushing each prediction snapshot into a ring buffer for server reconciliation.
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
   * Predicts local movement for the current local player entity.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {number|null} localEntityId - The local player's entity ID.
   * @param {number} deltaTime - Frame time delta in seconds.
   */
  update(ecsWorld, localEntityId, deltaTime) {
    if (localEntityId === null || !this.physicsWorld.initialized) return;

    const playerComp = ecsWorld.getComponent(localEntityId, 'Player');
    const physComp = ecsWorld.getComponent(localEntityId, 'Physics');
    const transformComp = ecsWorld.getComponent(localEntityId, 'Transform');
    const inputComp = ecsWorld.getComponent(localEntityId, 'Input');

    if (!physComp || !transformComp || !inputComp || (playerComp && playerComp.isDead)) return;

    const { yaw, pitch, inputMask, sequence } = inputComp;

    // 1. Calculate relative movement vector
    let moveX = 0;
    let moveZ = 0;

    if (hasFlag(inputMask, INPUT_FLAGS.FORWARD)) moveZ -= 1;
    if (hasFlag(inputMask, INPUT_FLAGS.BACKWARD)) moveZ += 1;
    if (hasFlag(inputMask, INPUT_FLAGS.LEFT)) moveX -= 1;
    if (hasFlag(inputMask, INPUT_FLAGS.RIGHT)) moveX += 1;

    // Normalize diagonal velocity
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    // 2. Rotate relative movement into world coordinates using view yaw
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const worldMoveX = moveX * cosYaw - moveZ * sinYaw;
    const worldMoveZ = moveX * sinYaw + moveZ * cosYaw;

    // Apply speed
    const speed = GAME_CONFIG.PLAYER_SPEED;
    physComp.velocity.x = worldMoveX * speed;
    physComp.velocity.z = worldMoveZ * speed;

    // Vertical gravity and jump dynamics
    if (physComp.isGrounded) {
      physComp.velocity.y = -0.1;
      if (hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
        physComp.velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE;
        physComp.isGrounded = false;
      }
    } else {
      physComp.velocity.y += GAME_CONFIG.GRAVITY * deltaTime;
    }

    // 3. Compute predicted displacement via local Rapier Character Controller
    const movementDelta = {
      x: physComp.velocity.x * deltaTime,
      y: physComp.velocity.y * deltaTime,
      z: physComp.velocity.z * deltaTime,
    };

    physComp.controller.computeColliderMovement(
      physComp.collider,
      movementDelta
    );

    const correctedMovement = physComp.controller.getComputedMovement();
    const currentPos = physComp.rigidBody.translation();

    const predictedPos = {
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    };

    // Update local physics state and grounded status
    physComp.rigidBody.setNextKinematicTranslation(predictedPos);
    physComp.isGrounded = physComp.controller.isGrounded();

    // Direct sync to Transform component
    transformComp.position.x = predictedPos.x;
    transformComp.position.y = predictedPos.y;
    transformComp.position.z = predictedPos.z;
    transformComp.rotation.yaw = yaw;
    transformComp.rotation.pitch = pitch;

    // 4. Save state snapshot & input frame into prediction ring buffer
    this.inputBuffer.push({
      sequence,
      inputMask,
      yaw,
      pitch,
      deltaTime,
      predictedPosition: { ...predictedPos },
      velocity: { ...physComp.velocity },
      isGrounded: physComp.isGrounded,
    });
  }
}