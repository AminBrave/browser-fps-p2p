// src/ecs/systems/HealthSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, PLAYER_CONFIG, DEFAULT_WEAPON } from '../../config/index.js';
import { WORLD_CONFIG } from '../../config/index.js';
import { clearPlayerImpactMarks } from '../entities/createBullet.js';
import { audio } from '../../audio/AudioManager.js';
import { EVENT_TYPES } from '../../network/PacketTypes.js';

export class HealthSystem {
  constructor(physicsWorld, eventSink = null) {
    this.physicsWorld = physicsWorld;
    this.eventSink = eventSink;
    this.pendingDamageEvents = [];
    this.spawnCursor = 0;
  }

  setEventSink(eventSink) {
    this.eventSink = eventSink;
    this.pendingDamageEvents = [];
    this.spawnCursor = 0;
  }

  applyDamage(targetEntity, amount, attackerId = null) {
    if (!targetEntity) return;
    this.pendingDamageEvents.push({ targetEntity, amount, attackerId });
  }

  _isSpawnFree(ecsWorld, entity, x, y, z) {
    const radius = PLAYER_CONFIG.RADIUS + 0.08;
    const halfHeight = PLAYER_CONFIG.HEIGHT / 2;

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
        const damage = Math.max(0, Number(event.amount) || 0);
        player.health = Math.max(0, player.health - damage);
        if (damage > 0 && event.attackerId != null) {
          player.lastDamagedBy = event.attackerId;
          player.lastDamagedAt = now;
        }
        if (player.health <= 0 && before > 0) {
          player.isDead = true;
          const attacker = Array.from(ecsWorld.with('player')).find(
            (candidate) => candidate.player?.id === event.attackerId
          );
          if (attacker?.player && attacker !== entity) {
            attacker.player.kills = (attacker.player.kills || 0) + 1;
          }
          player.lastAttackerId = event.attackerId ?? null;
          player.deathTime = now;
          player.deaths = (player.deaths || 0) + 1;
          player.respawnTimer = PLAYER_CONFIG.RESPAWN_TIME_MS || 3000;
          entity.physics?.rigidBody?.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
          entity.physics?.rigidBody?.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
          if (entity.renderMesh?.mesh) entity.renderMesh.mesh.visible = false;
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'death',
            sourceId: player.id,
            position: { ...entity.transform.position },
          });
          if (player.isLocal) audio.playDeath();
        }
      }
    }

    for (const entity of ecsWorld.with('player', 'transform')) {
      const player = entity.player;
      const transform = entity.transform;
      const physics = entity.physics;
      if (player && !player.isDead) {
        const maxHealth = Math.max(1, Number(player.maxHealth) || PLAYER_CONFIG.MAX_HEALTH || 100);
        const health = Math.max(0, Number(player.health) || 0);
        const delay = Math.max(0, Number(GAME_CONFIG.HEALTH_REGEN?.DELAY_MS) || 3500);
        const rate = Math.max(0, Number(GAME_CONFIG.HEALTH_REGEN?.RATE_PER_SECOND) || 12);
        if (health < maxHealth && now - (Number(player.lastDamagedAt) || 0) >= delay) {
          const previousHealth = health;
          const delta = Math.min(maxHealth - health, rate / 60);
          player.health = health + delta;
          player.impactMarkClearAccumulator = (Number(player.impactMarkClearAccumulator) || 0) + delta / maxHealth;
          const clearFraction = Math.min(1, player.impactMarkClearAccumulator);
          if (clearFraction > 0) {
            clearPlayerImpactMarks(ecsWorld, entity, clearFraction);
            player.impactMarkClearAccumulator = Math.max(0, player.impactMarkClearAccumulator - clearFraction);
          }
        }
      }
      if (!player?.isDead) continue;

      const respawnDelay = GAME_CONFIG.RESPAWN_TIME_MS || 3000;
      if (now - (player.deathTime || 0) < respawnDelay) continue;

      const spawn = this._findSpawn(ecsWorld, entity);
      player.isDead = false;
      player.health = player.maxHealth || PLAYER_CONFIG.MAX_HEALTH || 100;
      player.lastDamagedAt = now;
      player.impactMarkClearAccumulator = 0;
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
