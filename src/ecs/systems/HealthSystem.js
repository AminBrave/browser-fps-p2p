// src/ecs/systems/HealthSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, DEFAULT_WEAPON } from '../../config/constants.js';
import { WORLD_CONFIG } from '../../config/world.js';
import { audio } from '../../audio/AudioManager.js';

export class HealthSystem {
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
    this.pendingDamageEvents = [];
    this.spawnCursor = 0;
  }

  applyDamage(targetEntity, amount, attackerId = null) {
    if (!targetEntity) return;
    this.pendingDamageEvents.push({ targetEntity, amount, attackerId });
  }

  _isSpawnFree(ecsWorld, entity, x, y, z) {
    const radius = GAME_CONFIG.PLAYER_RADIUS + 0.08;
    const halfHeight = GAME_CONFIG.PLAYER_HEIGHT / 2;

    const overlapsAabb = (box) => {
      const closestX = Math.max(box.min.x, Math.min(x, box.max.x));
      const closestZ = Math.max(box.min.z, Math.min(z, box.max.z));
      const dx = x - closestX;
      const dz = z - closestZ;
      const vertical = y - halfHeight < box.max.y && y + halfHeight > box.min.y;
      return vertical && dx * dx + dz * dz <= radius * radius;
    };

    for (const other of ecsWorld.with('player', 'transform')) {
      if (other === entity || other.player?.isDead) continue;
      const p = other.transform.position;
      if (Math.hypot(p.x - x, p.z - z) < GAME_CONFIG.PLAYER_RADIUS * 2 + 0.12) {
        return false;
      }
    }

    for (const object of ecsWorld.with('isSolid', 'renderMesh')) {
      if (object === entity || object.isBoundary === false && object.isMap === false) continue;
      const mesh = object.renderMesh?.mesh;
      if (!mesh) continue;
      mesh.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) continue;
      if (overlapsAabb(box)) return false;
    }

    return true;
  }

  _findSpawn(ecsWorld, entity) {
    const configured = WORLD_CONFIG.PLAYER.SPAWN_POINTS || [];
    const candidates = [];
    for (const point of configured) candidates.push(point);

    // Deterministic fallback grid: no random respawns inside geometry.
    for (let z = -28; z <= 28; z += 8) {
      for (let x = -28; x <= 28; x += 8) {
        candidates.push({ x, z });
      }
    }

    const start = this.spawnCursor++ % Math.max(1, candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      const point = candidates[(start + i) % candidates.length];
      const y = WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2 + 0.04;
      if (this._isSpawnFree(ecsWorld, entity, point.x, y, point.z)) {
        return { x: point.x, y, z: point.z };
      }
    }

    return {
      x: 0,
      y: WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2 + 0.5,
      z: 0,
    };
  }

  update(ecsWorld, damageQueue = null) {
    const now = performance.now();
    const queueToProcess = Array.isArray(damageQueue)
      ? damageQueue
      : this.pendingDamageEvents;

    if (queueToProcess?.length) {
      while (queueToProcess.length > 0) {
        const event = queueToProcess.shift();
        const entity = event.targetEntity || event.entity;
        if (!entity?.player) continue;

        const player = entity.player;
        if (player.isDead) continue;

        const before = player.health;
        player.health = Math.max(0, player.health - Math.max(0, event.amount || 0));
        if (player.health <= 0 && before > 0) {
          player.isDead = true;
          player.deathTime = now;
          player.deaths = (player.deaths || 0) + 1;
          player.respawnTimer = GAME_CONFIG.RESPAWN_TIME_MS || 3000;
          entity.physics?.rigidBody?.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
          entity.physics?.rigidBody?.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
          if (entity.renderMesh?.mesh) entity.renderMesh.mesh.visible = false;
          if (player.isLocal) audio.playDeath();
        }
      }
    }

    for (const entity of ecsWorld.with('player', 'transform')) {
      const player = entity.player;
      const transform = entity.transform;
      const physics = entity.physics;
      if (!player?.isDead) continue;

      const respawnDelay = GAME_CONFIG.RESPAWN_TIME_MS || 3000;
      if (now - (player.deathTime || 0) < respawnDelay) continue;

      const spawn = this._findSpawn(ecsWorld, entity);
      player.isDead = false;
      player.health = player.maxHealth || GAME_CONFIG.MAX_HEALTH || 100;
      player.respawnTimer = 0;

      transform.position.x = spawn.x;
      transform.position.y = spawn.y;
      transform.position.z = spawn.z;

      if (physics?.rigidBody?.setLinvel) {
        physics.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      physics?.rigidBody?.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
      physics?.rigidBody?.setTranslation?.(spawn, true);
      physics?.rigidBody?.setNextKinematicTranslation?.(spawn);

      if (entity.renderMesh?.mesh) {
        entity.renderMesh.mesh.position.set(spawn.x, spawn.y, spawn.z);
        entity.renderMesh.mesh.visible = !player.isLocal;
      }

      if (entity.character?.pose) {
        entity.character.pose.position.y = 0;
        entity.character.pose.scale.y = 1;
      }

      if (entity.weapon) {
        const activeSize = entity.weapon.magazineSize || DEFAULT_WEAPON.MAGAZINE_SIZE || 12;
        entity.weapon.magazine = activeSize;
        entity.weapon.reserveAmmo = DEFAULT_WEAPON.RESERVE_AMMO ?? activeSize * 3;
        entity.weapon.ammo = activeSize;
        entity.weapon.currentAmmo = activeSize;
        entity.weapon.maxAmmo = activeSize;
        entity.weapon.isReloading = false;
        entity.weapon.shootHeldPrev = false;
        entity.weapon.currentSpread = 0;
        entity.weapon.shotsInBurst = 0;
      }
    }
  }
}
