// src/physics/PhysicsWorld.js

import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Wrapper class managing the Rapier3D WebAssembly physics engine state, 
 * rigid body instantiation, and simulation stepping.
 */
export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
  }

  /**
   * Loads the Rapier WASM module and initializes the 3D physics gravity vector.
   * @returns {Promise<void>}
   */
  async init() {
    await RAPIER.init();
    // Gravity vector set to standard earth gravity (-9.81 m/s^2 on Y axis)
    const gravity = { x: 0.0, y: -19.62, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.initialized = true;
  }

  /**
   * Steps the physics simulation forward by a fixed time delta.
   */
  step() {
    if (this.world) {
      this.world.step();
    }
  }

  /**
   * Creates a dynamic kinematic controller or rigid body for player movement.
   * @param {number} x - Initial X coordinate.
   * @param {number} y - Initial Y coordinate.
   * @param {number} z - Initial Z coordinate.
   * @param {number} radius - Player capsule radius.
   * @param {number} height - Player capsule height.
   * @returns {{ body: RAPIER.RigidBody, collider: RAPIER.Collider, controller: RAPIER.KinematicCharacterController }}
   */
  createPlayerBody(x, y, z, radius = 0.4, height = 1.8) {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y, z);
    const body = this.world.createRigidBody(rigidBodyDesc);

    const halfHeight = Math.max(0.01, (height - radius * 2) / 2);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    const collider = this.world.createCollider(colliderDesc, body);

    // Create Rapier kinematic character controller for handling slopes & step offsets
    const controller = this.world.createCharacterController(0.01);
    controller.enableAutostep(0.5, 0.2, true);
    controller.enableSnapToGround(0.5);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });

    return { body, collider, controller };
  }

  /**
   * Creates a static box collider for map geometry.
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @param {number} hx - Half-extent X
   * @param {number} hy - Half-extent Y
   * @param {number} hz - Half-extent Z
   * @returns {{ body: RAPIER.RigidBody, collider: RAPIER.Collider }}
   */
  createStaticBox(x, y, z, hx, hy, hz) {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    const collider = this.world.createCollider(colliderDesc, body);

    return { body, collider };
  }

  /**
   * Performs a raycast against the physics world for hitscan shooting logic.
   * @param {{x: number, y: number, z: number}} origin 
   * @param {{x: number, y: number, z: number}} direction 
   * @param {number} maxDistance 
   * @returns {RAPIER.RayColliderHit | null}
   */
  castRay(origin, direction, maxDistance = 100) {
    const ray = new RAPIER.Ray(origin, direction);
    return this.world.castRay(ray, maxDistance, true);
  }
}