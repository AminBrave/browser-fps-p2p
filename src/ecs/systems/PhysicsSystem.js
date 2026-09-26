// src/ecs/systems/PhysicsSystem.js

import { GAME_CONFIG, INPUT_FLAGS } from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';

/**
 * PhysicsSystem
 * Calculates player kinematic movements using Rapier3D Character Controller,
 * handles gravity, jumping, and steps the underlying physics world simulation.
 */
export class PhysicsSystem {
  /**
   * @param {object} physicsWorld - Rapier3D PhysicsWorld wrapper instance.
   */
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  /**
   * Main system update tick.
   * 
   * @param {object} ecsWorld - Miniplex v2 ECS world instance.
   * @param {number} deltaTime - Time step delta in seconds.
   */
  update(ecsWorld, deltaTime) {
    if (!this.physicsWorld || !this.physicsWorld.world) return;

    const dt = deltaTime || (1 / 60);
    const entities = ecsWorld.with('transform', 'physics');

    for (const entity of entities) {
      const transform = entity.transform;
      const physics = entity.physics;
      const input = entity.input;

      if (!transform || !physics) continue;

      // 1. Calculate directional movement vectors if input component exists
      if (input) {
        let moveX = 0;
        let moveZ = 0;

        if (hasFlag(input.inputMask, INPUT_FLAGS.FORWARD)) moveZ -= 1;
        if (hasFlag(input.inputMask, INPUT_FLAGS.BACKWARD)) moveZ += 1;
        if (hasFlag(input.inputMask, INPUT_FLAGS.LEFT)) moveX -= 1;
        if (hasFlag(input.inputMask, INPUT_FLAGS.RIGHT)) moveX += 1;

        // Normalize directional vector
        const moveLen = Math.hypot(moveX, moveZ);
        if (moveLen > 0) {
          moveX /= moveLen;
          moveZ /= moveLen;
        }

        // Apply orientation yaw rotation to movement vectors
        const yaw = input.yaw || 0;
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);

        const worldMoveX = moveX * cosYaw - moveZ * sinYaw;
        const worldMoveZ = moveX * sinYaw + moveZ * cosYaw;

        const speed = GAME_CONFIG.PLAYER_SPEED || 8.0;
        if (!physics.velocity) physics.velocity = { x: 0, y: 0, z: 0 };

        physics.velocity.x = worldMoveX * speed;
        physics.velocity.z = worldMoveZ * speed;

        // Jump & Gravity logic
        if (physics.isGrounded) {
          physics.velocity.y = -0.1;
          if (hasFlag(input.inputMask, INPUT_FLAGS.JUMP)) {
            physics.velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE || 7.0;
            physics.isGrounded = false;
          }
        } else {
          physics.velocity.y += (GAME_CONFIG.GRAVITY || -20.0) * dt;
        }
      }

      // 2. Perform character controller movement step in Rapier3D
      if (physics.controller && physics.collider && physics.rigidBody) {
        const movementDelta = {
          x: (physics.velocity?.x || 0) * dt,
          y: (physics.velocity?.y || 0) * dt,
          z: (physics.velocity?.z || 0) * dt,
        };

        // Compute movement collision against environment
        physics.controller.computeColliderMovement(physics.collider, movementDelta);

        // Fetch computed movement vector (Rapier v0.11+ method name)
        const correctedMovement = typeof physics.controller.computedMovement === 'function'
          ? physics.controller.computedMovement()
          : (typeof physics.controller.getComputedMovement === 'function' 
              ? physics.controller.getComputedMovement() 
              : movementDelta);

        const currentPos = physics.rigidBody.translation();
        const newPos = {
          x: currentPos.x + correctedMovement.x,
          y: currentPos.y + correctedMovement.y,
          z: currentPos.z + correctedMovement.z,
        };

        // Update Kinematic position & ECS transform
        physics.rigidBody.setNextKinematicTranslation(newPos);

        // Fetch grounded status (Rapier v0.11+ method name)
        physics.isGrounded = typeof physics.controller.computedGrounded === 'function'
          ? physics.controller.computedGrounded()
          : (typeof physics.controller.isGrounded === 'function' 
              ? physics.controller.isGrounded() 
              : true);

        transform.position.x = newPos.x;
        transform.position.y = newPos.y;
        transform.position.z = newPos.z;
      }
    }

    // Step Rapier physics world simulation
    this.physicsWorld.step(dt);
  }
}