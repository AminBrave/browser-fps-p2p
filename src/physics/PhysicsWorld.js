// src/physics/PhysicsWorld.js

import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Wrapper for Rapier3D WASM physics: bodies, stepping, hitscan raycasts,
 * and collider → entity lookup for weapon hits.
 */
export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    /** @type {Map<number, object>} collider handle → ECS entity */
    this.colliderToEntity = new Map();
  }

  async init() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -19.62, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.initialized = true;
  }

  step() {
    if (this.world) this.world.step();
  }

  /**
   * Register an ECS entity against a Rapier collider handle (for hitscan).
   * @param {object} collider
   * @param {object} entity
   */
  registerColliderEntity(collider, entity) {
    if (!collider) return;
    const handle = collider.handle ?? collider;
    this.colliderToEntity.set(handle, entity);
  }

  /**
   * @param {object} collider
   */
  unregisterCollider(collider) {
    if (!collider) return;
    const handle = collider.handle ?? collider;
    this.colliderToEntity.delete(handle);
  }

  createPlayerBody(x, y, z, radius = 0.4, height = 1.8) {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      x,
      y,
      z
    );
    const body = this.world.createRigidBody(rigidBodyDesc);

    const halfHeight = Math.max(0.01, (height - radius * 2) / 2);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    const collider = this.world.createCollider(colliderDesc, body);

    const controller = this.world.createCharacterController(0.01);
    controller.enableAutostep(0.5, 0.2, true);
    controller.enableSnapToGround(0.5);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });

    return { body, collider, controller };
  }

  createStaticBox(x, y, z, hx, hy, hz) {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  /**
   * Hitscan raycast.
   * @param {{x:number,y:number,z:number}} origin
   * @param {{x:number,y:number,z:number}} direction - should be normalized
   * @param {number} maxDistance
   * @param {object|null} excludeCollider - shooter's collider to ignore
   * @returns {{ point: object, normal: object, toi: number, collider: object, entity: object|null } | null}
   */
  castRay(origin, direction, maxDistance = 100, excludeCollider = null) {
    if (!this.world) return null;

    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dir = {
      x: direction.x / len,
      y: direction.y / len,
      z: direction.z / len,
    };

    const ray = new RAPIER.Ray(origin, dir);
    const excludeHandle = excludeCollider
      ? excludeCollider.handle ?? excludeCollider
      : null;

    // Prefer API that supports exclude collider when available
    let hit = null;
    try {
      if (excludeHandle != null && typeof this.world.castRay === 'function') {
        // rapier-compat: castRay(ray, maxToi, solid)
        hit = this.world.castRay(ray, maxDistance, true);
        // If we hit ourselves, nudge origin forward and retry once
        if (hit && hit.collider && (hit.collider.handle ?? hit.collider) === excludeHandle) {
          const nudged = {
            x: origin.x + dir.x * 0.6,
            y: origin.y + dir.y * 0.6,
            z: origin.z + dir.z * 0.6,
          };
          const ray2 = new RAPIER.Ray(nudged, dir);
          hit = this.world.castRay(ray2, Math.max(0.1, maxDistance - 0.6), true);
          if (hit) {
            // toi is from nudged origin; convert to world point from original for consistency
            const toi = hit.timeOfImpact ?? hit.toi ?? 0;
            return this._formatHit(nudged, dir, hit, toi);
          }
          return null;
        }
      } else {
        hit = this.world.castRay(ray, maxDistance, true);
      }
    } catch {
      hit = this.world.castRay(ray, maxDistance, true);
    }

    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    return this._formatHit(origin, dir, hit, toi);
  }

  _formatHit(origin, dir, hit, toi) {
    const point = {
      x: origin.x + dir.x * toi,
      y: origin.y + dir.y * toi,
      z: origin.z + dir.z * toi,
    };

    let normal = { x: 0, y: 1, z: 0 };
    if (hit.normal) {
      normal = { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z };
    }

    const collider = hit.collider || null;
    const handle = collider ? collider.handle ?? collider : null;
    const entity =
      handle != null ? this.colliderToEntity.get(handle) || null : null;

    return { point, normal, toi, collider, entity };
  }
}
