import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, WORLD_CONFIG, PHYSICS_CONFIG, STANCE } from '../config/index.js';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderToEntity = new Map();
    this.colliderToRenderTarget = new Map();
    this.colliderToHitZone = new Map();
    this.colliderToMaterial = new Map();
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

  registerColliderEntity(collider, entity, renderTarget = null, hitZone = null, materialType = null) {
    if (!collider) return;
    const handle = collider.handle ?? collider;
    this.colliderToEntity.set(handle, entity);
    if (renderTarget) this.colliderToRenderTarget.set(handle, renderTarget);
    if (hitZone) this.colliderToHitZone.set(handle, hitZone);
    if (materialType) this.colliderToMaterial.set(handle, materialType);
  }

  getProjectileMaterial(hit = null) {
    const collider = hit?.collider;
    const handle = collider?.handle ?? collider;
    return (handle != null ? this.colliderToMaterial.get(handle) : null) || 'default';
  }

  /**
   * Return the exact exit distance through the already-hit Rapier shape.
   * Rapier's collider-local ray query with solid=false is important here:
   * the ray starts just inside the material, so Rapier returns the next
   * boundary instead of treating the shape as an infinitely solid point.
   */
  getProjectileExitDistance(collider, origin, direction, maxDistance) {
    if (!collider?.castRay || !origin || !direction) return null;
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      dir
    );
    const toi = collider.castRay(ray, Math.max(0.001, maxDistance), false);
    return Number.isFinite(toi) && toi >= 0 ? toi : null;
  }
  unregisterCollider(collider) {
    if (!collider) return;
    const handle = collider.handle ?? collider;
    this.colliderToEntity.delete(handle);
    this.colliderToRenderTarget.delete(handle);
    this.colliderToHitZone.delete(handle);
    this.colliderToMaterial.delete(handle);
  }

  createPlayerBody(x, y, z, radius = PHYSICS_CONFIG.DEFAULT_PLAYER_RADIUS, height = PHYSICS_CONFIG.DEFAULT_PLAYER_HEIGHT) {
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
    const movementRadius = Math.min(radius, height * PHYSICS_CONFIG.MOVEMENT_RADIUS_FACTOR);
    const movementHalfSegment = Math.max(PHYSICS_CONFIG.MIN_MOVEMENT_HALF_SEGMENT, height / 2 - movementRadius);
    const { WORLD: WORLD_GROUP, PLAYER_SOLID: PLAYER_SOLID_GROUP, HITBOX: HITBOX_GROUP } = PHYSICS_CONFIG.COLLISION_GROUPS;

    const movementCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(movementHalfSegment, movementRadius),
      body
    );
    // Locomotion colliders collide only with the static world. Remote players
    // therefore cannot physically push/unstick/tunnel local players.
    movementCollider.setCollisionGroups?.(
      (PLAYER_SOLID_GROUP << 16) | WORLD_GROUP
    );

    const torsoHalfHeight = Math.max(PHYSICS_CONFIG.HITBOX.TORSO_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.TORSO_HALF_HEIGHT_FACTOR);
    const torsoRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.TORSO_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.TORSO_MAX_RADIUS);
    const headRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.HEAD_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.HEAD_MAX_RADIUS);
    const torso = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(torsoHalfHeight, torsoRadius)
        .setTranslation(0, height * PHYSICS_CONFIG.HITBOX.TORSO_Y_FACTOR, 0),
      body
    );
    const head = this.world.createCollider(
      RAPIER.ColliderDesc.ball(headRadius)
        .setTranslation(0, height * PHYSICS_CONFIG.HITBOX.HEAD_Y_FACTOR, 0),
      body
    );

    const limbRadius = Math.max(PHYSICS_CONFIG.HITBOX.LIMB_MIN_RADIUS, radius * PHYSICS_CONFIG.HITBOX.LIMB_RADIUS_FACTOR);
    const armHalf = Math.max(PHYSICS_CONFIG.HITBOX.ARM_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.ARM_HALF_HEIGHT_FACTOR);
    const legHalf = Math.max(PHYSICS_CONFIG.HITBOX.LEG_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.LEG_HALF_HEIGHT_FACTOR);
    const armX = radius * PHYSICS_CONFIG.HITBOX.ARM_X_FACTOR;
    const legX = radius * PHYSICS_CONFIG.HITBOX.LEG_X_FACTOR;

    const leftArm = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(armHalf, limbRadius)
        .setTranslation(-armX, height * PHYSICS_CONFIG.HITBOX.ARM_Y_FACTOR, 0),
      body
    );
    const rightArm = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(armHalf, limbRadius)
        .setTranslation(armX, height * 0.02, 0),
      body
    );
    const leftLeg = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(legHalf, limbRadius)
        .setTranslation(-legX, height * PHYSICS_CONFIG.HITBOX.LEG_Y_FACTOR, 0),
      body
    );
    const rightLeg = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(legHalf, limbRadius)
        .setTranslation(legX, -height * 0.38, 0),
      body
    );

    const colliders = [movementCollider, torso, head, leftArm, rightArm, leftLeg, rightLeg];
    const hitZones = [null, 'torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

    // Hitboxes are query targets, not physical obstacles. Sensors still
    // participate in ray-casts, but cannot disturb character locomotion.
    for (const hitbox of [torso, head, leftArm, rightArm, leftLeg, rightLeg]) {
      hitbox.setSensor?.(true);
      hitbox.setCollisionGroups?.(HITBOX_GROUP << 16);
    }

    // Character controller uses the full-height movement envelope; anatomical
    // colliders remain the authoritative bullet hit geometry.
    const controller = this.world.createCharacterController(PHYSICS_CONFIG.CONTROLLER.OFFSET);
    controller.enableAutostep(PHYSICS_CONFIG.CONTROLLER.AUTOSTEP_HEIGHT, PHYSICS_CONFIG.CONTROLLER.AUTOSTEP_WIDTH, true);
    controller.enableSnapToGround(PHYSICS_CONFIG.CONTROLLER.SNAP_TO_GROUND_DISTANCE);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });

    return { body, collider: movementCollider, colliders, hitZones, controller };
  }

  /**
   * Keep anatomical hitboxes aligned with the rendered stance. Hitboxes are
   * attached to the same kinematic body as the movement capsule, so their
   * transforms must be changed relative to the parent body.
   */
  updatePlayerHitZones(physics, stance = 0) {
    const colliders = physics?.colliders;
    if (!colliders || colliders.length < 7) return;

    const height = GAME_CONFIG.PLAYER_HEIGHT;
    const radius = GAME_CONFIG.PLAYER_RADIUS;
    const pose = stance === STANCE.PRONE
      ? { offsetY: PHYSICS_CONFIG.HITBOX.PRONE_OFFSET_Y, scaleY: PHYSICS_CONFIG.HITBOX.PRONE_SCALE_Y }
      : stance === STANCE.CROUCH
        ? { offsetY: PHYSICS_CONFIG.HITBOX.CROUCH_OFFSET_Y, scaleY: PHYSICS_CONFIG.HITBOX.CROUCH_SCALE_Y }
        : { offsetY: 0, scaleY: 1 };
    const scale = pose.scaleY;
    const radialScale = PHYSICS_CONFIG.HITBOX.RADIAL_BASE + PHYSICS_CONFIG.HITBOX.RADIAL_SCALE * scale;

    const torsoHalf = Math.max(PHYSICS_CONFIG.HITBOX.TORSO_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.TORSO_HALF_HEIGHT_FACTOR) * scale;
    const torsoRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.TORSO_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.TORSO_MAX_RADIUS) * radialScale;
    const headRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.HEAD_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.HEAD_MAX_RADIUS) * radialScale;
    const limbRadius = Math.max(PHYSICS_CONFIG.HITBOX.LIMB_MIN_RADIUS, radius * PHYSICS_CONFIG.HITBOX.LIMB_RADIUS_FACTOR) * radialScale;
    const armHalf = Math.max(PHYSICS_CONFIG.HITBOX.ARM_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.ARM_HALF_HEIGHT_FACTOR) * scale;
    const legHalf = Math.max(PHYSICS_CONFIG.HITBOX.LEG_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.LEG_HALF_HEIGHT_FACTOR) * scale;
    const armX = radius * PHYSICS_CONFIG.HITBOX.ARM_X_FACTOR * radialScale;
    const legX = radius * PHYSICS_CONFIG.HITBOX.LEG_X_FACTOR * radialScale;

    const setCapsule = (collider, halfHeight, r, x, y, z = 0) => {
      collider?.setHalfHeight?.(halfHeight);
      collider?.setRadius?.(r);
      collider?.setTranslationWrtParent?.({ x, y, z });
    };
    const setBall = (collider, r, x, y, z = 0) => {
      collider?.setRadius?.(r);
      collider?.setTranslationWrtParent?.({ x, y, z });
    };

    setCapsule(colliders[1], torsoHalf, torsoRadius, 0, height * PHYSICS_CONFIG.HITBOX.TORSO_Y_FACTOR * scale + pose.offsetY);
    setBall(colliders[2], headRadius, 0, height * PHYSICS_CONFIG.HITBOX.HEAD_Y_FACTOR * scale + pose.offsetY + (scale < 1 ? PHYSICS_CONFIG.HITBOX.CROUCH_HEAD_Y_BIAS : 0));
    setCapsule(colliders[3], armHalf, limbRadius, -armX, height * PHYSICS_CONFIG.HITBOX.ARM_Y_FACTOR * scale + pose.offsetY);
    setCapsule(colliders[4], armHalf, limbRadius, armX, height * PHYSICS_CONFIG.HITBOX.ARM_Y_FACTOR * scale + pose.offsetY);
    setCapsule(colliders[5], legHalf, limbRadius, -legX, height * PHYSICS_CONFIG.HITBOX.LEG_Y_FACTOR * scale + pose.offsetY);
    setCapsule(colliders[6], legHalf, limbRadius, legX, height * PHYSICS_CONFIG.HITBOX.LEG_Y_FACTOR * scale + pose.offsetY);
  }

  createStaticBox(x, y, z, hx, hy, hz, rotationY = 0, renderTarget = null, materialType = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cuboid(hx, hy, hz), renderTarget, materialType }],
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
      colliderMaterials: parts.map((part) => part.materialType || null),
    };
  }

  createStaticCone(x, y, z, radius, height, rotationY = 0, renderTarget = null, materialType = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cone(height / 2, radius), renderTarget, materialType }],
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

  /**
   * Validate a respawn point against the authoritative physics world.
   * Render meshes are deliberately not used here: the collision world is the
   * source of truth, so a spawn cannot place a player inside a crate, car,
   * wall, mountain, or any other solid prop.
   */
  isSpawnPositionSafe(ecsWorld, position, radius = GAME_CONFIG.PLAYER_RADIUS, height = GAME_CONFIG.PLAYER_HEIGHT, ignoreEntity = null) {
    if (!this.world || !position) return false;

    const map = WORLD_CONFIG.MAP;
    const padding = 0.12;
    const halfHeight = height / 2;
    const x = Number(position.x) || 0;
    const y = Number(position.y) || 0;
    const z = Number(position.z) || 0;

    // Keep the entire player envelope inside the playable map.
    if (x - radius - padding < -map.WIDTH / 2 ||
        x + radius + padding > map.WIDTH / 2 ||
        z - radius - padding < -map.LENGTH / 2 ||
        z + radius + padding > map.LENGTH / 2) {
      return false;
    }

    // Other living players are gameplay blockers even though player movement
    // capsules intentionally do not collide with each other in Rapier.
    for (const other of ecsWorld?.with?.('player', 'transform') || []) {
      if (other === ignoreEntity || other.player?.isDead) continue;
      const p = other.transform?.position;
      if (!p) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const minDistance = radius + (Number(GAME_CONFIG.PLAYER_RADIUS) || radius) + padding;
      const verticalOverlap =
        y - halfHeight < p.y + halfHeight &&
        y + halfHeight > p.y - halfHeight;
      if (verticalOverlap && dx * dx + dz * dz < minDistance * minDistance) {
        return false;
      }
    }

    // Probe the candidate envelope radially at multiple heights. A point can
    // be clear at the feet but still put the head/torso inside a tall object.
    const probeHeights = [y - halfHeight * 0.72, y, y + halfHeight * 0.72];
    const directions = 16;
    const probeDistance = radius + padding;
    for (const probeY of probeHeights) {
      for (let i = 0; i < directions; i++) {
        const angle = (i / directions) * Math.PI * 2;
        const hit = this.castRay(
          { x, y: probeY, z },
          { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
          probeDistance,
          ignoreEntity?.physics?.colliders || null
        );
        if (hit?.entity && hit.entity !== ignoreEntity) return false;
      }
    }

    // Require a nearby supporting surface below the capsule. This rejects
    // random points in mid-air while still allowing elevated platforms.
    const groundHit = this.castRay(
      { x, y: y + 0.05, z },
      { x: 0, y: -1, z: 0 },
      height + 0.35,
      ignoreEntity?.physics?.colliders || null
    );
    if (!groundHit || groundHit.entity?.player) return false;

    // Ensure there is head clearance above the spawn point.
    const ceilingHit = this.castRay(
      { x, y, z },
      { x: 0, y: 1, z: 0 },
      halfHeight + padding,
      ignoreEntity?.physics?.colliders || null
    );
    if (ceilingHit?.entity && ceilingHit.entity !== ignoreEntity) return false;

    return true;
  }

  castRay(origin, direction, maxDistance = PHYSICS_CONFIG.DEFAULT_RAY_DISTANCE, excludeCollider = null) {
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

    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, dir);
    const filterPredicate = (collider) => {
      const handle = collider?.handle ?? collider;
      if (excluded.has(handle)) return false;

      // Movement capsules are physical locomotion envelopes, not bullet
      // hitboxes. Exclude them at the query level instead of hitting them
      // first and then advancing the ray from inside the same solid collider.
      // With solid=true, the old loop could repeatedly return that collider
      // at toi=0 and never reach the anatomical sensors inside it.
      const hitEntity = this.colliderToEntity.get(handle) || null;
      const hitZone = this.colliderToHitZone.get(handle) || null;
      return !(hitEntity?.player && !hitZone);
    };

    const hit = typeof this.world.castRayAndGetNormal === 'function'
      ? this.world.castRayAndGetNormal(
          ray,
          maxDistance,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          filterPredicate
        )
      : this.world.castRay(
          ray,
          maxDistance,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          filterPredicate
        );

    if (!hit) return null;
    const normal = hit.normal
      ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
      : null;
    return this._formatHit(origin, dir, hit, normal);
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
      material: this.getProjectileMaterial({ collider }),
    };
  }

  dispose() {
    if (!this.initialized) return;
    this.colliderToEntity.clear();
    this.colliderToRenderTarget.clear();
    this.colliderToHitZone.clear();
    this.colliderToMaterial.clear();
    this.world?.free?.();
    this.world = null;
    this.initialized = false;
  }
}
