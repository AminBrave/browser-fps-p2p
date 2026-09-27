import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG } from '../config/constants.js';
import { WORLD_CONFIG } from '../config/world.js';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderToEntity = new Map();
    this.colliderToRenderTarget = new Map();
    this.colliderToHitZone = new Map();
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

  registerColliderEntity(collider, entity, renderTarget = null, hitZone = null) {
    if (!collider) return;
    const handle = collider.handle ?? collider;
    this.colliderToEntity.set(handle, entity);
    if (renderTarget) this.colliderToRenderTarget.set(handle, renderTarget);
    if (hitZone) this.colliderToHitZone.set(handle, hitZone);
  }

  unregisterCollider(collider) {
    if (!collider) return;
    const handle = collider.handle ?? collider;
    this.colliderToEntity.delete(handle);
    this.colliderToRenderTarget.delete(handle);
    this.colliderToHitZone.delete(handle);
  }

  createPlayerBody(x, y, z, radius = 0.4, height = 1.8) {
    if (!this.world) throw new Error('Physics world is not initialized');

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
    );

    // Player locomotion uses one compound rigid body. Bullet queries hit the
    // individual anatomical colliders, so the visual surface, impact point and
    // damage zone can all refer to the same part.
    // The locomotion capsule is the authoritative solid envelope: exactly
    // PLAYER_HEIGHT high and PLAYER_RADIUS wide. Anatomical hit colliders are
    // separate so movement solidity and hit-zone precision cannot conflict.
    const movementRadius = Math.min(radius, height * 0.25);
    const movementHalfSegment = Math.max(0.08, height / 2 - movementRadius);
    const movementCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(movementHalfSegment, movementRadius),
      body
    );

    const torsoHalfHeight = Math.max(0.12, height * 0.20);
    const torsoRadius = Math.min(radius * 0.72, 0.24);
    const headRadius = Math.min(radius * 0.52, 0.20);
    const torso = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(torsoHalfHeight, torsoRadius)
        .setTranslation(0, height * 0.08, 0),
      body
    );
    const head = this.world.createCollider(
      RAPIER.ColliderDesc.ball(headRadius)
        .setTranslation(0, height * 0.36, 0),
      body
    );

    const limbRadius = Math.max(0.055, radius * 0.20);
    const armHalf = Math.max(0.08, height * 0.18);
    const legHalf = Math.max(0.10, height * 0.19);
    const armX = radius * 0.86;
    const legX = radius * 0.34;

    const leftArm = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(armHalf, limbRadius)
        .setTranslation(-armX, height * 0.02, 0),
      body
    );
    const rightArm = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(armHalf, limbRadius)
        .setTranslation(armX, height * 0.02, 0),
      body
    );
    const leftLeg = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(legHalf, limbRadius)
        .setTranslation(-legX, -height * 0.38, 0),
      body
    );
    const rightLeg = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(legHalf, limbRadius)
        .setTranslation(legX, -height * 0.38, 0),
      body
    );

    const colliders = [movementCollider, torso, head, leftArm, rightArm, leftLeg, rightLeg];
    const hitZones = [null, 'torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

    // Character controller movement needs a stable body collider. The torso
    // is the locomotion collider; the anatomical colliders are the authoritative
    // bullet hit geometry.
    const controller = this.world.createCharacterController(0.01);
    controller.enableAutostep(0.5, 0.2, true);
    controller.enableSnapToGround(0.5);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });

    return { body, collider: torso, colliders, hitZones, controller };
  }

  createStaticBox(x, y, z, hx, hy, hz, rotationY = 0, renderTarget = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cuboid(hx, hy, hz), renderTarget }],
      rotationY
    );
  }

  createStaticCompound(x, y, z, parts, rotationY = 0) {
    if (!this.world) throw new Error('Physics world is not initialized');
    if (!parts?.length) throw new Error('Static compound requires at least one part');

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation(this._yawQuaternion(rotationY))
    );

    const colliders = parts.map((part) => {
      const desc = part.desc ? part.desc : new RAPIER.ColliderDesc(part.shape);
      desc.setTranslation(part.position?.x ?? 0, part.position?.y ?? 0, part.position?.z ?? 0);
      if (part.rotation) desc.setRotation(part.rotation);
      return this.world.createCollider(desc, body);
    });

    return {
      body,
      collider: colliders[0],
      colliders,
      colliderTargets: parts.map((part) => part.renderTarget || null),
      hitZones: parts.map((part) => part.hitZone || null),
    };
  }

  createStaticCone(x, y, z, radius, height, rotationY = 0, renderTarget = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cone(height / 2, radius), renderTarget }],
      rotationY
    );
  }

  createStaticCylinder(x, y, z, radius, height, rotationY = 0, renderTarget = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cylinder(height / 2, radius), renderTarget }],
      rotationY
    );
  }

  _yawQuaternion(rotationY = 0) {
    return { x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) };
  }

  createWorldSafetyFloor() {
    const { WIDTH, LENGTH } = WORLD_CONFIG.MAP;
    const { Y, THICKNESS } = WORLD_CONFIG.MAP.SAFETY_FLOOR;
    return this.createStaticBox(0, Y - THICKNESS / 2, 0, WIDTH / 2, THICKNESS / 2, LENGTH / 2);
  }

  castRay(origin, direction, maxDistance = 100, excludeCollider = null) {
    if (!this.world) return null;
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };

    const excluded = new Set();
    const addExcluded = (value) => {
      if (!value) return;
      if (Array.isArray(value) || value instanceof Set) {
        for (const item of value) addExcluded(item);
        return;
      }
      if (value.colliders) {
        addExcluded(value.colliders);
        return;
      }
      excluded.add(value.handle ?? value);
    };
    addExcluded(excludeCollider);

    let currentOrigin = { x: origin.x, y: origin.y, z: origin.z };
    let remaining = maxDistance;
    for (let attempt = 0; attempt < 16 && remaining > 0.001; attempt++) {
      const ray = new RAPIER.Ray(currentOrigin, dir);
      const hit = typeof this.world.castRayAndGetNormal === 'function'
        ? this.world.castRayAndGetNormal(ray, remaining, true)
        : this.world.castRay(ray, remaining, true);
      if (!hit) return null;

      const collider = hit.collider || null;
      const handle = collider ? collider.handle ?? collider : null;
      const toi = hit.timeOfImpact ?? hit.toi ?? 0;
      if (!excluded.has(handle)) {
        const normal = hit.normal
          ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
          : null;
        return this._formatHit(currentOrigin, dir, hit, normal);
      }

      const advance = Math.max(0.002, toi + 0.002);
      currentOrigin = {
        x: currentOrigin.x + dir.x * advance,
        y: currentOrigin.y + dir.y * advance,
        z: currentOrigin.z + dir.z * advance,
      };
      remaining -= advance;
    }
    return null;
  }

  _formatHit(origin, dir, hit, normalFromApi) {
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    const point = { x: origin.x + dir.x * toi, y: origin.y + dir.y * toi, z: origin.z + dir.z * toi };
    let normal = normalFromApi || hit.normal || { x: -dir.x, y: -dir.y, z: -dir.z };
    const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
    normal = { x: normal.x / nLen, y: normal.y / nLen, z: normal.z / nLen };

    const collider = hit.collider || null;
    const handle = collider ? collider.handle ?? collider : null;
    return {
      point,
      normal,
      toi,
      collider,
      entity: handle != null ? this.colliderToEntity.get(handle) || null : null,
      renderTarget: handle != null ? this.colliderToRenderTarget.get(handle) || null : null,
      hitZone: handle != null ? this.colliderToHitZone.get(handle) || null : null,
    };
  }

  dispose() {
    if (!this.initialized) return;
    this.colliderToEntity.clear();
    this.colliderToRenderTarget.clear();
    this.colliderToHitZone.clear();
    this.world?.free?.();
    this.world = null;
    this.initialized = false;
  }
}
