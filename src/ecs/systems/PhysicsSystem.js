// src/ecs/systems/PhysicsSystem.js

import { applyFpsMovement } from '../../utils/Movement.js';

/**
 * PhysicsSystem
 * Camera-relative FPS movement via Rapier3D Character Controller,
 * gravity, jumping, and physics world step.
 */
export class PhysicsSystem {
  /**
   * @param {object} physicsWorld
   */
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  /**
   * @param {object} ecsWorld
   * @param {number} deltaTime
   */
  update(ecsWorld, deltaTime) {
    if (!this.physicsWorld || !this.physicsWorld.world) return;

    const dt = deltaTime || 1 / 60;
    const entities = ecsWorld.with('transform', 'physics');

    for (const entity of entities) {
      const transform = entity.transform;
      const physics = entity.physics;
      const input = entity.input;

      if (!transform || !physics) continue;

      if (!physics.velocity) physics.velocity = { x: 0, y: 0, z: 0 };

      if (input) {
        const yaw = input.yaw || 0;
        physics.isGrounded = applyFpsMovement(
          input.inputMask || 0,
          yaw,
          physics.velocity,
          physics.isGrounded,
          dt
        );

        // Keep transform orientation in sync with look direction (for remote meshes / snapshots)
        if (transform.rotation) {
          transform.rotation.yaw = yaw;
          transform.rotation.pitch = input.pitch || 0;
        }
      }

      if (physics.controller && physics.collider && physics.rigidBody) {
        const movementDelta = {
          x: (physics.velocity.x || 0) * dt,
          y: (physics.velocity.y || 0) * dt,
          z: (physics.velocity.z || 0) * dt,
        };

        physics.controller.computeColliderMovement(physics.collider, movementDelta);

        const correctedMovement =
          typeof physics.controller.computedMovement === 'function'
            ? physics.controller.computedMovement()
            : typeof physics.controller.getComputedMovement === 'function'
              ? physics.controller.getComputedMovement()
              : movementDelta;

        const currentPos = physics.rigidBody.translation();
        const newPos = {
          x: currentPos.x + correctedMovement.x,
          y: currentPos.y + correctedMovement.y,
          z: currentPos.z + correctedMovement.z,
        };

        physics.rigidBody.setNextKinematicTranslation(newPos);

        physics.isGrounded =
          typeof physics.controller.computedGrounded === 'function'
            ? physics.controller.computedGrounded()
            : typeof physics.controller.isGrounded === 'function'
              ? physics.controller.isGrounded()
              : physics.isGrounded;

        transform.position.x = newPos.x;
        transform.position.y = newPos.y;
        transform.position.z = newPos.z;
      }
    }

    this.physicsWorld.step(dt);
  }
}
