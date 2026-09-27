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

    // The host is authoritative for every player. In particular, a player
    // marked networkRole="remote" is a remote player from the host's
    // perspective, but it still MUST be simulated on the host.
    for (const entity of ecsWorld.with('transform', 'physics')) {
      const transform = entity.transform;
      const physics = entity.physics;
      const input = entity.input;

      if (!transform || !physics) continue;
      if (!physics.velocity) {
        physics.velocity = { x: 0, y: 0, z: 0 };
      }

      if (input) {
        this.physicsWorld.updatePlayerHitZones(physics, input.stance ?? STANCE.STAND);

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

      if (!physics.controller || !physics.collider || !physics.rigidBody) {
        continue;
      }

      const movementDelta = {
        x: (physics.velocity.x || 0) * dt,
        y: (physics.velocity.y || 0) * dt,
        z: (physics.velocity.z || 0) * dt,
      };

      physics.controller.computeColliderMovement(
        physics.collider,
        movementDelta
      );

      const correctedMovement =
        typeof physics.controller.computedMovement === 'function'
          ? physics.controller.computedMovement()
          : typeof physics.controller.getComputedMovement === 'function'
            ? physics.controller.getComputedMovement()
            : movementDelta;

      const currentPos = physics.rigidBody.translation();
      const nextPosition = {
        x: currentPos.x + correctedMovement.x,
        y: currentPos.y + correctedMovement.y,
        z: currentPos.z + correctedMovement.z,
      };

      physics.rigidBody.setNextKinematicTranslation(nextPosition);

      physics.isGrounded =
        typeof physics.controller.computedGrounded === 'function'
          ? physics.controller.computedGrounded()
          : typeof physics.controller.isGrounded === 'function'
            ? physics.controller.isGrounded()
            : physics.isGrounded;

      // Keep the ECS state aligned with the exact kinematic target. The
      // post-step pass below replaces this with Rapier's committed position.
      transform.position.x = nextPosition.x;
      transform.position.y = nextPosition.y;
      transform.position.z = nextPosition.z;
    }

    this.physicsWorld.step(dt);

    // Only controller/player bodies are copied from Rapier into ECS.
    // Static map bodies have collider-center origins that intentionally differ
    // from their Three.js render-root origins.
    for (const entity of ecsWorld.with('transform', 'physics')) {
      const physics = entity.physics;
      const body = physics?.rigidBody;

      if (!body || !physics?.controller) continue;

      const transform = entity.transform;
      const position = body.translation();

      transform.position.x = position.x;
      transform.position.y = position.y;
      transform.position.z = position.z;

      if (typeof body.linvel === 'function' && physics.velocity) {
        const velocity = body.linvel();
        physics.velocity.x = velocity.x;
        physics.velocity.y = velocity.y;
        physics.velocity.z = velocity.z;
      }
    }
  }
}
