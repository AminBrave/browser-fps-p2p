// src/ecs/systems/network/ClientReconcileSystem.js

import { GAME_CONFIG } from '../../../config/constants.js';
import { hasFlag } from '../../../utils/BitFlags.js';
import { INPUT_FLAGS } from '../../../config/constants.js';

/**
 * ClientReconcileSystem (Client-Only)
 * Processes incoming authoritative server snapshots, compares server state against
 * local historical prediction snapshots, and performs re-simulation if a misprediction occurs.
 */
export class ClientReconcileSystem {
  /**
   * @param {object} physicsWorld - Rapier3D physics world wrapper instance.
   * @param {object} inputBuffer - CircularBuffer holding pending unacknowledged inputs.
   */
  constructor(physicsWorld, inputBuffer) {
    this.physicsWorld = physicsWorld;
    this.inputBuffer = inputBuffer;
  }

  /**
   * Evaluates server state snapshot and reconciles client prediction errors.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {number|null} localEntityId - The local player entity ID.
   * @param {object} latestSnapshot - Latest decoded snapshot received from host server.
   */
  update(ecsWorld, localEntityId, latestSnapshot) {
    if (localEntityId === null || !latestSnapshot || !this.physicsWorld.initialized) return;

    const playerComp = ecsWorld.getComponent(localEntityId, 'Player');
    const physComp = ecsWorld.getComponent(localEntityId, 'Physics');
    const transformComp = ecsWorld.getComponent(localEntityId, 'Transform');

    if (!playerComp || !physComp || !transformComp) return;

    // Locate local player's state entry inside host snapshot
    const serverPlayerData = latestSnapshot.players.find(p => p.id === playerComp.id);
    if (!serverPlayerData) return;

    // Update local player health and death flags directly from authoritative state
    playerComp.health = serverPlayerData.health;
    if (playerComp.health <= 0) {
      playerComp.isDead = true;
    }

    const lastAcknowledgedSeq = serverPlayerData.lastProcessedSequence;
    if (lastAcknowledgedSeq === 0) return;

    // Discard acknowledged inputs from ring buffer up to host-processed sequence
    while (this.inputBuffer.size > 0) {
      const head = this.inputBuffer.peek();
      if (head && head.sequence <= lastAcknowledgedSeq) {
        this.inputBuffer.shift();
      } else {
        break;
      }
    }

    // Check position error threshold against authoritative server position
    const serverPos = serverPlayerData.position;
    const currentPos = transformComp.position;

    const distError = Math.hypot(
      serverPos.x - currentPos.x,
      serverPos.y - currentPos.y,
      serverPos.z - currentPos.z
    );

    // Re-simulate inputs if error exceeds error threshold
    if (distError > GAME_CONFIG.RECONCILIATION_THRESHOLD) {
      // 1. Teleport local body to server position
      physComp.rigidBody.setNextKinematicTranslation(serverPos);
      transformComp.position.x = serverPos.x;
      transformComp.position.y = serverPos.y;
      transformComp.position.z = serverPos.z;

      // 2. Re-simulate remaining unacknowledged inputs in sequence
      const unacknowledgedInputs = this.inputBuffer.toArray();
      for (let i = 0; i < unacknowledgedInputs.length; i++) {
        const inputFrame = unacknowledgedInputs[i];
        this._reSimulateInputFrame(physComp, transformComp, inputFrame);
      }
    }
  }

  /**
   * Single frame physics replay step during client reconciliation.
   * @private
   */
  _reSimulateInputFrame(physComp, transformComp, inputFrame) {
    const { yaw, pitch, inputMask, deltaTime } = inputFrame;

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

    const speed = GAME_CONFIG.PLAYER_SPEED;
    physComp.velocity.x = worldMoveX * speed;
    physComp.velocity.z = worldMoveZ * speed;

    if (physComp.isGrounded) {
      physComp.velocity.y = -0.1;
      if (hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
        physComp.velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE;
        physComp.isGrounded = false;
      }
    } else {
      physComp.velocity.y += GAME_CONFIG.GRAVITY * deltaTime;
    }

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

    const reconciledPos = {
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    };

    physComp.rigidBody.setNextKinematicTranslation(reconciledPos);
    physComp.isGrounded = physComp.controller.isGrounded();

    transformComp.position.x = reconciledPos.x;
    transformComp.position.y = reconciledPos.y;
    transformComp.position.z = reconciledPos.z;
    transformComp.rotation.yaw = yaw;
    transformComp.rotation.pitch = pitch;

    // Update stored predicted position in input frame record
    inputFrame.predictedPosition = { ...reconciledPos };
  }
}