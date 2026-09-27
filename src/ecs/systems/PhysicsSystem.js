// src/ecs/systems/PhysicsSystem.js

import { applyFpsMovement } from '../../utils/Movement.js';
import { STANCE } from '../../config/index.js';

export class PhysicsSystem {
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  update(ecsWorld, deltaTime) {
    if (!this.physicsWorld?.world) return;

    const dt = deltaTime || 1 / 60;

    for (const entity of ecsWorld.with('transform', 'physics')) {
      if (entity.networkRole === 'remote') continue;
      const transform = entity.transform;
      const physics = entity.physics;
      const input = entity.input;
      if (!transform || !physics) continue;

      if (!physics.velocity) physics.velocity = { x: 0, y: 0, z: 0 };

      if (input) {
        const yaw = input.yaw || 0;
        const stance = input.stance ?? STANCE.STAND;
        physics.isGrounded = applyFpsMovement(
          input.inputMask || 0,
          yaw,
          physics.velocity,
          physics.isGrounded,
          dt,
          stance
        );

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

    // Read the committed Rapier state after step(); never publish the
    // pre-step kinematic target as authoritative state.
    for (const entity of ecsWorld.with('transform', 'physics')) {
      if (entity.networkRole === 'remote') continue;
      const body = entity.physics?.rigidBody;
      if (!body) continue;
      const position = body.translation();
      entity.transform.position.x = position.x;
      entity.transform.position.y = position.y;
      entity.transform.position.z = position.z;
      if (typeof body.linvel === 'function' && entity.physics.velocity) {
        const velocity = body.linvel();
        entity.physics.velocity.x = velocity.x;
        entity.physics.velocity.y = velocity.y;
        entity.physics.velocity.z = velocity.z;
      }
    }
  }
}
