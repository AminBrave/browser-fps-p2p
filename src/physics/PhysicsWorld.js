import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, WORLD_CONFIG, PHYSICS_CONFIG, STANCE } from '../config/index.js';
import { ColliderRegistry } from './ColliderRegistry.js';
import { PhysicsQueries } from './PhysicsQueries.js';
import { CharacterPhysics } from './CharacterPhysics.js';
import { StaticPhysics } from './StaticPhysics.js';
import { createWorldSafetyFloor } from './WorldSafetyFloor.js';
import { SpawnSafety } from './SpawnSafety.js';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.initialized = false;
    this.colliderRegistry = new ColliderRegistry();
    this.queries = new PhysicsQueries(() => this.world, this.colliderRegistry);
    this.characterPhysics = new CharacterPhysics(() => this.world);
    this.staticPhysics = new StaticPhysics(() => this.world);
    this.spawnSafety = new SpawnSafety({ castRay: (...args) => this.castRay(...args) });
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

  registerColliderEntity(collider, entity, hitZone = null, materialType = null) {
    this.colliderRegistry.register(collider, entity, hitZone, materialType);
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

  createPrimitiveCollider(part) {
    return this.staticPhysics.createPrimitiveCollider(part);
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

    return this.spawnSafety.isSafe(position, {
      radius,
      height,
      ignoreEntity,
      players: ecsWorld?.with?.('player', 'transform') || [],
    });
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
