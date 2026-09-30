import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_CONFIG } from '../config/index.js';

/**
 * Narrow Rapier query boundary. Queries return plain data plus the original
 * collider reference; callers do not need to know Rapier's query API.
 */
export class PhysicsQueries {
  constructor(getWorld, colliderRegistry) {
    this.getWorld = getWorld;
    this.registry = colliderRegistry;
  }

  _normalizeDirection(direction) {
    const len = Math.hypot(direction?.x || 0, direction?.y || 0, direction?.z || 0) || 1;
    return { x: (direction?.x || 0) / len, y: (direction?.y || 0) / len, z: (direction?.z || 0) / len };
  }

  _excludedHandles(excludeCollider) {
    const excluded = new Set();
    const add = (value) => {
      if (!value) return;
      if (Array.isArray(value) || value instanceof Set) {
        for (const item of value) add(item);
        return;
      }
      if (value.colliders) {
        add(value.colliders);
        return;
      }
      excluded.add(value.handle ?? value);
    };
    add(excludeCollider);
    return excluded;
  }

  castRayStatic(origin, direction, maxDistance = PHYSICS_CONFIG.DEFAULT_RAY_DISTANCE, excludeCollider = null) {
    const world = this.getWorld();
    if (!world || !origin || !direction) return null;
    const dir = this._normalizeDirection(direction);
    const excluded = this._excludedHandles(excludeCollider);
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, dir);
    const filterPredicate = (collider) => {
      const handle = collider?.handle ?? collider;
      if (excluded.has(handle)) return false;
      if (this.registry.isPlayerMovementCollider(collider)) return false;
      return !this.registry.getHitZone(collider);
    };
    const hit = typeof world.castRayAndGetNormal === 'function'
      ? world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, undefined, undefined, filterPredicate)
      : world.castRay(ray, maxDistance, true, undefined, undefined, undefined, undefined, filterPredicate);
    return hit ? this._formatHit(origin, dir, hit) : null;
  }

  castRay(origin, direction, maxDistance = PHYSICS_CONFIG.DEFAULT_RAY_DISTANCE, excludeCollider = null) {
    const world = this.getWorld();
    if (!world || !origin || !direction) return null;

    const dir = this._normalizeDirection(direction);
    const excluded = this._excludedHandles(excludeCollider);
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, dir);

    const filterPredicate = (collider) => {
      const handle = collider?.handle ?? collider;
      if (excluded.has(handle)) return false;
      return !this.registry.isPlayerMovementCollider(collider);
    };

    const hit = typeof world.castRayAndGetNormal === 'function'
      ? world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, undefined, undefined, filterPredicate)
      : world.castRay(ray, maxDistance, true, undefined, undefined, undefined, undefined, filterPredicate);

    if (!hit) return null;
    return this._formatHit(origin, dir, hit);
  }

  getProjectileExitHit(collider, origin, direction, maxDistance) {
    const world = this.getWorld();
    if (!world || !collider || !origin || !direction) return null;

    const dir = this._normalizeDirection(direction);
    const handle = collider.handle ?? collider;
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, dir);
    const limit = Math.max(0.001, Number(maxDistance) || 0.001);
    const filterPredicate = (candidate) => (candidate?.handle ?? candidate) === handle;

    const hit = typeof world.castRayAndGetNormal === 'function'
      ? world.castRayAndGetNormal(ray, limit, false, undefined, undefined, undefined, undefined, filterPredicate)
      : null;

    if (!hit) {
      const toi = collider.castRay?.(ray, limit, false);
      if (!Number.isFinite(toi) || toi < 0) return null;
      return { distance: toi, normal: null };
    }

    const toi = Number(hit.timeOfImpact ?? hit.toi);
    if (!Number.isFinite(toi) || toi < 0) return null;
    const rawNormal = hit.normal;
    if (!rawNormal) return { distance: toi, normal: null };

    const normalLength = Math.hypot(rawNormal.x, rawNormal.y, rawNormal.z) || 1;
    return {
      distance: toi,
      normal: { x: rawNormal.x / normalLength, y: rawNormal.y / normalLength, z: rawNormal.z / normalLength },
    };
  }

  _formatHit(origin, dir, hit) {
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    const point = { x: origin.x + dir.x * toi, y: origin.y + dir.y * toi, z: origin.z + dir.z * toi };
    let normal = hit.normal || { x: -dir.x, y: -dir.y, z: -dir.z };
    const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
    normal = { x: normal.x / nLen, y: normal.y / nLen, z: normal.z / nLen };

    const collider = hit.collider || null;
    return {
      point,
      normal,
      toi,
      collider,
      entity: this.registry.getEntity(collider),
      hitZone: this.registry.getHitZone(collider),
      material: this.registry.getMaterial(collider),
    };
  }
}
