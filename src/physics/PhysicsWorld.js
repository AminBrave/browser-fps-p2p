import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG } from '../config/constants.js';
import { WORLD_CONFIG } from '../config/world.js';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderToEntity = new Map();
  }

  async init() {
    if (this.initialized) return;
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0.0, y: GAME_CONFIG.GRAVITY, z: 0.0 });
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
    if (!this.world) throw new Error('Physics world is not initialized');

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

  createStaticBox(x, y, z, hx, hy, hz, rotationY = 0) {
    if (!this.world) throw new Error('Physics world is not initialized');

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation(this._yawQuaternion(rotationY))
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz),
      body
    );
    return { body, collider };
  }

  createStaticCone(x, y, z, radius, height, rotationY = 0) {
    if (!this.world) throw new Error('Physics world is not initialized');

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation(this._yawQuaternion(rotationY))
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cone(height / 2, radius),
      body
    );
    return { body, collider };
  }

  createStaticCylinder(x, y, z, radius, height, rotationY = 0) {
    if (!this.world) throw new Error('Physics world is not initialized');

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation(this._yawQuaternion(rotationY))
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius),
      body
    );
    return { body, collider };
  }

  _yawQuaternion(rotationY = 0) {
    return {
      x: 0,
      y: Math.sin(rotationY / 2),
      z: 0,
      w: Math.cos(rotationY / 2),
    };
  }

  createWorldSafetyFloor() {
    const { WIDTH, LENGTH } = WORLD_CONFIG.MAP;
    const { Y, THICKNESS } = WORLD_CONFIG.MAP.SAFETY_FLOOR;
    return this.createStaticBox(
      0,
      Y - THICKNESS / 2,
      0,
      WIDTH / 2,
      THICKNESS / 2,
      LENGTH / 2
    );
  }

  castRay(origin, direction, maxDistance = 100, excludeCollider = null) {
    if (!this.world) return null;

    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dir = {
      x: direction.x / len,
      y: direction.y / len,
      z: direction.z / len,
    };

    const ray = new RAPIER.Ray(origin, dir);
    const excludeHandle =
      excludeCollider ? excludeCollider.handle ?? excludeCollider : null;

    let hit = typeof this.world.castRayAndGetNormal === 'function'
      ? this.world.castRayAndGetNormal(ray, maxDistance, true)
      : this.world.castRay(ray, maxDistance, true);

    let normalFromApi = hit?.normal
      ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
      : null;

    const collider = hit?.collider;
    const handle = collider ? collider.handle ?? collider : null;

    if (excludeHandle != null && handle === excludeHandle) {
      const nudged = {
        x: origin.x + dir.x * 0.55,
        y: origin.y + dir.y * 0.55,
        z: origin.z + dir.z * 0.55,
      };
      const ray2 = new RAPIER.Ray(nudged, dir);
      hit = typeof this.world.castRayAndGetNormal === 'function'
        ? this.world.castRayAndGetNormal(
            ray2,
            Math.max(0.1, maxDistance - 0.55),
            true
          )
        : this.world.castRay(ray2, Math.max(0.1, maxDistance - 0.55), true);
      normalFromApi = hit?.normal
        ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
        : null;

      if (!hit) return null;
      return this._formatHit(nudged, dir, hit, normalFromApi);
    }

    if (!hit) return null;
    return this._formatHit(origin, dir, hit, normalFromApi);
  }

  _formatHit(origin, dir, hit, normalFromApi) {
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    const point = {
      x: origin.x + dir.x * toi,
      y: origin.y + dir.y * toi,
      z: origin.z + dir.z * toi,
    };

    let normal = normalFromApi || (
      hit.normal
        ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
        : { x: -dir.x, y: -dir.y, z: -dir.z }
    );

    const dot = normal.x * dir.x + normal.y * dir.y + normal.z * dir.z;
    if (dot > 0) {
      normal = { x: -normal.x, y: -normal.y, z: -normal.z };
    }

    const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
    normal = {
      x: normal.x / nLen,
      y: normal.y / nLen,
      z: normal.z / nLen,
    };

    const collider = hit.collider || null;
    const handle = collider ? collider.handle ?? collider : null;
    const entity = handle != null
      ? this.colliderToEntity.get(handle) || null
      : null;

    return { point, normal, toi, collider, entity };
  }

  dispose() {
    if (!this.initialized) return;

    this.colliderToEntity.clear();
    this.world?.free?.();
    this.world = null;
    this.initialized = false;
  }
}
