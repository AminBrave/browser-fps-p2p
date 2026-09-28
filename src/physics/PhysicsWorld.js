import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, WORLD_CONFIG, PHYSICS_CONFIG, STANCE } from '../config/index.js';
import { ColliderRegistry } from './ColliderRegistry.js';
import { PhysicsQueries } from './PhysicsQueries.js';
import { CharacterPhysics } from './CharacterPhysics.js';
import { StaticPhysics } from './StaticPhysics.js';
import { createWorldSafetyFloor } from './WorldSafetyFloor.js';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderRegistry = new ColliderRegistry();
    this.queries = new PhysicsQueries(() => this.world, this.colliderRegistry);
    this.characterPhysics = new CharacterPhysics(() => this.world);
    this.staticPhysics = new StaticPhysics(() => this.world);
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

  createStaticBox(...args) {
    return this.staticPhysics.createStaticBox(...args);
  }

  createStaticCompound(...args) {
    return this.staticPhysics.createStaticCompound(...args);
  }

  createStaticCone(...args) {
    return this.staticPhysics.createStaticCone(...args);
  }

  createStaticCylinder(...args) {
    return this.staticPhysics.createStaticCylinder(...args);
  }

  createWorldSafetyFloor() {
    return createWorldSafetyFloor(this.staticPhysics);
  }

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
