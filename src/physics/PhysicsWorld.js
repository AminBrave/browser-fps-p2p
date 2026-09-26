// src/physics/PhysicsWorld.js

import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderToEntity = new Map();
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0.0, y: -19.62, z: 0.0 });
    this.initialized = true;
  }

  step() {
    if (this.world) this.world.step();
  }

  registerColliderEntity(collider, entity) {
    if (!collider) return;
    this.colliderToEntity.set(collider.handle ?? collider, entity);
  }

  unregisterCollider(collider) {
    if (!collider) return;
    this.colliderToEntity.delete(collider.handle ?? collider);
  }

  createPlayerBody(x, y, z, radius = 0.4, height = 1.8) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
    );
    const halfHeight = Math.max(0.01, (height - radius * 2) / 2);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius),
      body
    );
    const controller = this.world.createCharacterController(0.01);
    controller.enableAutostep(0.5, 0.2, true);
    controller.enableSnapToGround(0.5);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });
    return { body, collider, controller };
  }

  createStaticBox(x, y, z, hx, hy, hz) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz),
      body
    );
    return { body, collider };
  }

  /**
   * Hitscan with surface normal (castRayAndGetNormal when available).
   * Normal is flipped to face the shooter (outward from surface).
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

    let hit = null;
    let normalFromApi = null;

    // Prefer API that returns contact normal
    if (typeof this.world.castRayAndGetNormal === 'function') {
      hit = this.world.castRayAndGetNormal(ray, maxDistance, true);
      if (hit?.normal) {
        normalFromApi = {
          x: hit.normal.x,
          y: hit.normal.y,
          z: hit.normal.z,
        };
      }
    } else {
      hit = this.world.castRay(ray, maxDistance, true);
    }

    if (!hit) return null;

    // Self-hit: nudge and retry
    const col = hit.collider;
    const handle = col ? col.handle ?? col : null;
    if (excludeHandle != null && handle === excludeHandle) {
      const nudged = {
        x: origin.x + dir.x * 0.55,
        y: origin.y + dir.y * 0.55,
        z: origin.z + dir.z * 0.55,
      };
      const ray2 = new RAPIER.Ray(nudged, dir);
      if (typeof this.world.castRayAndGetNormal === 'function') {
        hit = this.world.castRayAndGetNormal(ray2, Math.max(0.1, maxDistance - 0.55), true);
        if (hit?.normal) {
          normalFromApi = {
            x: hit.normal.x,
            y: hit.normal.y,
            z: hit.normal.z,
          };
        }
      } else {
        hit = this.world.castRay(ray2, Math.max(0.1, maxDistance - 0.55), true);
      }
      if (!hit) return null;
      return this._formatHit(nudged, dir, hit, normalFromApi);
    }

    return this._formatHit(origin, dir, hit, normalFromApi);
  }

  _formatHit(origin, dir, hit, normalFromApi) {
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    const point = {
      x: origin.x + dir.x * toi,
      y: origin.y + dir.y * toi,
      z: origin.z + dir.z * toi,
    };

    let normal = normalFromApi;
    if (!normal && hit.normal) {
      normal = { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z };
    }
    if (!normal) {
      // Face the incoming ray (approximation)
      normal = { x: -dir.x, y: -dir.y, z: -dir.z };
    }

    // Ensure normal points toward the shooter (against ray direction)
    const dot = normal.x * dir.x + normal.y * dir.y + normal.z * dir.z;
    if (dot > 0) {
      normal = { x: -normal.x, y: -normal.y, z: -normal.z };
    }

    // Normalize
    const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
    normal = {
      x: normal.x / nLen,
      y: normal.y / nLen,
      z: normal.z / nLen,
    };

    const collider = hit.collider || null;
    const handle = collider ? collider.handle ?? collider : null;
    const entity =
      handle != null ? this.colliderToEntity.get(handle) || null : null;

    return { point, normal, toi, collider, entity };
  }
}
