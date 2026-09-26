// src/ecs/components/Physics.js

/**
 * Physics Component Schema
 * References Rapier3D rigid body and character controller handles, 
 * along with velocity vectors for physical movement simulation.
 */
export const PhysicsComponent = {
  // Reference handle to Rapier3D RigidBody instance
  rigidBody: null,
  // Reference handle to Rapier3D CharacterController instance (if applicable)
  controller: null,
  // Reference handle to Rapier3D Collider instance
  collider: null,
  // Current velocity vector
  velocity: {
    x: 0,
    y: 0,
    z: 0,
  },
  // Ground contact indicator state
  isGrounded: false,
};

/**
 * Factory function creating a physics component binding structure.
 * @param {object} rigidBody - Rapier RigidBody instance.
 * @param {object} collider - Rapier Collider instance.
 * @param {object} [controller=null] - Optional Rapier CharacterController instance.
 * @returns {typeof PhysicsComponent}
 */
export function createPhysics(rigidBody, collider, controller = null) {
  return {
    rigidBody,
    collider,
    controller,
    velocity: { x: 0, y: 0, z: 0 },
    isGrounded: false,
  };
}