import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, WORLD_CONFIG, PHYSICS_CONFIG, STANCE } from '../config/index.js';
import { ColliderRegistry } from './ColliderRegistry.js';
import { PhysicsQueries } from './PhysicsQueries.js';
import { CharacterPhysics } from './CharacterPhysics.js';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderRegistry = new ColliderRegistry();
    this.queries = new PhysicsQueries(() => this.world, this.colliderRegistry);
    this.characterPhysics = new CharacterPhysics(() => this.world);
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
    this.colliderRegistry.register(collider, entity, renderTarget, hitZone, materialType);
  }

  getProjectileMaterial(hit = null) {
    return this.colliderRegistry.getMaterial(hit?.collider);
  }

  getProjectileExitHit(collider, origin, direction, maxDistance) {
    return this.queries.getProjectileExitHit(collider, origin, direction, maxDistance);
  }

  getProjectileExitDistance(collider, origin, direction, maxDistance) {
    return this.queries.getProjectileExitHit(collider, origin, direction, maxDistance)?.distance ?? null;
  }

  unregisterCollider(collider) {
    this.colliderRegistry.unregister(collider);
  }

  createPlayerBody(x, y, z, radius = PHYSICS_CONFIG.DEFAULT_PLAYER_RADIUS, height = PHYSICS_CONFIG.DEFAULT_PLAYER_HEIGHT) {
    return this.characterPhysics.createPlayerBody(x, y, z, radius, height);
  }

  updatePlayerHitZones(physics, stance = STANCE.STAND) {
    return this.characterPhysics.updatePlayerHitZones(physics, stance);
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
    return this.queries.castRay(origin, direction, maxDistance, excludeCollider);
  }

  dispose() {
    if (!this.initialized) return;
    this.colliderRegistry.clear();
    this.world?.free?.();
    this.world = null;
    this.initialized = false;
  }
}
