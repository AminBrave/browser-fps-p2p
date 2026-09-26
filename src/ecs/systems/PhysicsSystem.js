// src/ecs/systems/PhysicsSystem.js

import { GAME_CONFIG } from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { INPUT_FLAGS } from '../../config/constants.js';

/**
 * PhysicsSystem
 * Executes character movement logic via Rapier3D kinematic character controllers,
 * updates rigid body positions, and steps the physics world simulation.
 */
export class PhysicsSystem {
  /**
   * @param {object} physicsWorld - The PhysicsWorld instance wrapping Rapier3D WASM.
   */
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  /**
   * Updates player positions based on local or received input states, 
   * applies gravity and jumping forces, and steps the Rapier simulation forward.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {Array<number>} playerEntities - Array of entity IDs having Player & Physics components.
   * @param {number} deltaTime - Frame time delta in seconds.
   */
  update(ecsWorld, playerEntities, deltaTime) {
    if (!this.physicsWorld.initialized) return;

    for (let i = 0; i < playerEntities.length; i++) {
      const entityId = playerEntities[i];
      const playerComp = ecsWorld.getComponent(entityId, 'Player');
      const physComp = ecsWorld.getComponent(entityId, 'Physics');
      const transformComp = ecsWorld.getComponent(entityId, 'Transform');
      const inputComp = ecsWorld.getComponent(entityId, 'Input');

      if (!physComp || !transformComp || !inputComp) continue;

      // Skip dead players from executing physics simulation
      if (playerComp && playerComp.isDead) continue;

      // Extract look angles and movement input flags
      const { yaw, inputMask } = inputComp;

      // Calculate relative movement directions based on current view yaw
      let moveX = 0;
      let moveZ = 0;

      if (hasFlag(inputMask, INPUT_FLAGS.FORWARD)) moveZ -= 1;
      if (hasFlag(inputMask, INPUT_FLAGS.BACKWARD)) moveZ += 1;
      if (hasFlag(inputMask, INPUT_FLAGS.LEFT)) moveX -= 1;
      if (hasFlag(inputMask, INPUT_FLAGS.RIGHT)) moveX += 1;

      // Normalize diagonal movement vector
      const moveLen = Math.hypot(moveX, moveZ);
      if (moveLen > 0) {
        moveX /= moveLen;
        moveZ /= moveLen;
      }

      // Rotate movement vector into world coordinates using character yaw
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const worldMoveX = moveX * cosYaw - moveZ * sinYaw;
      const worldMoveZ = moveX * sinYaw + moveZ * cosYaw;

      // Apply horizontal movement speed
      const speed = GAME_CONFIG.PLAYER_SPEED;
      physComp.velocity.x = worldMoveX * speed;
      physComp.velocity.z = worldMoveZ * speed;

      // Process gravity & jump impulse
      if (physComp.isGrounded) {
        physComp.velocity.y = -0.1; // Slight downward sticky force to maintain ground contact
        if (hasFlag(inputMask, INPUT_FLAGS.JUMP)) {
          physComp.velocity.y = GAME_CONFIG.PLAYER_JUMP_FORCE;
          physComp.isGrounded = false;
        }
      } else {
        physComp.velocity.y += GAME_CONFIG.GRAVITY * deltaTime;
      }

      // Compute displacement delta for Rapier Kinematic Controller
      const movementDelta = {
        x: physComp.velocity.x * deltaTime,
        y: physComp.velocity.y * deltaTime,
        z: physComp.velocity.z * deltaTime,
      };

      // Compute movement collisions using Rapier Character Controller
      physComp.controller.computeColliderMovement(
        physComp.collider,
        movementDelta
      );

      // Extract corrected translation vector after applying collision offsets
      const correctedMovement = physComp.controller.getComputedMovement();
      const currentPos = physComp.rigidBody.translation();

      const newPos = {
        x: currentPos.x + correctedMovement.x,
        y: currentPos.y + correctedMovement.y,
        z: currentPos.z + correctedMovement.z,
      };

      // Set rigid body position and check ground status
      physComp.rigidBody.setNextKinematicTranslation(newPos);
      physComp.isGrounded = physComp.controller.isGrounded();

      // Sync computed position and orientation back to ECS Transform component
      transformComp.position.x = newPos.x;
      transformComp.position.y = newPos.y;
      transformComp.position.z = newPos.z;
      transformComp.rotation.yaw = yaw;
      transformComp.rotation.pitch = inputComp.pitch;
    }

    // Step Rapier3D WASM simulation world forward
    this.physicsWorld.step();
  }
}