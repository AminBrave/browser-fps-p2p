// src/ecs/systems/network/ClientReconcileSystem.js

import { GAME_CONFIG, INPUT_FLAGS } from '../../../config/constants.js';
import { hasFlag } from '../../../utils/BitFlags.js';

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
   * @param {object|number} localEntityOrId - Local player entity object or ID.
   * @param {object} latestSnapshot - Latest decoded snapshot received from host server.
   */
  update(ecsWorld, localEntityOrId, latestSnapshot) {
    if (!localEntityOrId || !latestSnapshot || !this.physicsWorld) return;

    // Resolve local player entity in Miniplex v2
    let localEntity = null;
    if (typeof localEntityOrId === 'object') {
      localEntity = localEntityOrId;
    } else {
      const players = ecsWorld.with('player', 'physics', 'transform');
      for (const entity of players) {
        if (entity.player && entity.player.isLocal) {
          localEntity = entity;
          break;
        }
      }
    }

    if (!localEntity || !localEntity.player || !localEntity.physics || !localEntity.transform) return;

    const playerComp = localEntity.player;
    const physComp = localEntity.physics;
    const transformComp = localEntity.transform;

    // Support both entities array or players array from snapshot decoder variants
    const snapshotEntities = latestSnapshot.entities || latestSnapshot.players || [];
    const serverPlayerData = snapshotEntities.find(p => (p.entityId || p.id) === playerComp.id);
    if (!serverPlayerData) return;

    // Update health and death states from authoritative server state
    if (serverPlayerData.health !== undefined) {
      playerComp.health = serverPlayerData.health;
      if (playerComp.health <= 0) {
        playerComp.isDead = true;
      }
    }

    const lastAcknowledgedSeq = latestSnapshot.lastAckedSeq || latestSnapshot.lastProcessedSequence || serverPlayerData.lastProcessedSequence || 0;

    // Discard acknowledged inputs from ring buffer up to host-processed sequence
    if (this.inputBuffer && typeof this.inputBuffer.size === 'number') {
      while (this.inputBuffer.size > 0) {
        const head = typeof this.inputBuffer.peek === 'function' ? this.inputBuffer.peek() : null;
        if (head && head.sequence <= lastAcknowledgedSeq) {
          if (typeof this.inputBuffer.shift === 'function') this.inputBuffer.shift();
        } else {
          break;
        }
      }
    }

    // Resolve position coordinates from server data
    const serverPos = {
      x: serverPlayerData.x !== undefined ? serverPlayerData.x : serverPlayerData.position?.x || 0,
      y: serverPlayerData.y !== undefined ? serverPlayerData.y : serverPlayerData.position?.y || 0,
      z: serverPlayerData.z !== undefined ? serverPlayerData.z : serverPlayerData.position?.z || 0,
    };
    const currentPos = transformComp.position;

    const distError = Math.hypot(
      serverPos.x - currentPos.x,
      serverPos.y - currentPos.y,
      serverPos.z - currentPos.z
    );

    const threshold = GAME_CONFIG.RECONCILIATION_THRESHOLD || 0.1;

    // Re-simulate inputs if error exceeds threshold
    if (distError > threshold) {
      // 1. Teleport local body to server position
      if (physComp.rigidBody && typeof physComp.rigidBody.setNextKinematicTranslation === 'function') {
        physComp.rigidBody.setNextKinematicTranslation(serverPos);
      }
      transformComp.position.x = serverPos.x;
      transformComp.position.y = serverPos.y;
      transformComp.position.z = serverPos.z;

      // 2. Re-simulate remaining unacknowledged inputs in sequence
      if (this.inputBuffer && typeof this.inputBuffer.toArray === 'function') {
        const unacknowledgedInputs = this.inputBuffer.toArray();
        for (let i = 0; i < unacknowledgedInputs.length; i++) {
          const inputFrame = unacknowledgedInputs[i];
          this._reSimulateInputFrame(physComp, transformComp, inputFrame);
        }
      }
    }
  }

  /**
   * Single frame physics replay step during client reconciliation.
   * @private
   */
  _reSimulateInputFrame(physComp, transformComp, inputFrame) {
    const { yaw, pitch, inputMask, deltaTime } = inputFrame;
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

    const cosYaw = Math.cos(yaw || 0);
    const sinYaw = Math.sin(yaw || 0);
    const worldMoveX = moveX * cosYaw - moveZ * sinYaw;
    const worldMoveZ = moveX * sinYaw + moveZ * cosYaw;

    const speed = GAME_CONFIG.PLAYER_SPEED || 8.0;
    if (!physComp.velocity) physComp.velocity = { x: 0, y: 0, z: 0 };
    physComp.velocity.x = worldMoveX * speed;
    physComp.velocity.z = worldMoveZ * speed;

    if (physComp.isGrounded) {
      physComp.velocity.y = -0.1;
      if (hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
        physComp.velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE || 7.0;
        physComp.isGrounded = false;
      }
    } else {
      physComp.velocity.y += (GAME_CONFIG.GRAVITY || -20.0) * dt;
    }

    const movementDelta = {
      x: physComp.velocity.x * dt,
      y: physComp.velocity.y * dt,
      z: physComp.velocity.z * dt,
    };

    if (physComp.controller && physComp.collider) {
      physComp.controller.computeColliderMovement(physComp.collider, movementDelta);
      const correctedMovement = physComp.controller.getComputedMovement();
      
      const currentPos = physComp.rigidBody ? physComp.rigidBody.translation() : transformComp.position;

      const reconciledPos = {
        x: currentPos.x + correctedMovement.x,
        y: currentPos.y + correctedMovement.y,
        z: currentPos.z + correctedMovement.z,
      };

      if (physComp.rigidBody && typeof physComp.rigidBody.setNextKinematicTranslation === 'function') {
        physComp.rigidBody.setNextKinematicTranslation(reconciledPos);
      }
      physComp.isGrounded = physComp.controller.isGrounded();

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