// src/ecs/systems/HealthSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, PLAYER_CONFIG, DEFAULT_WEAPON } from '../../config/index.js';
import { WORLD_CONFIG } from '../../config/index.js';
import {
  clearPlayerImpactMarks,
  getPlayerImpactMarkCount,
  updatePlayerImpactMarksForHealth,
} from '../entities/createBullet.js';
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
    return this.physicsWorld?.isSpawnPositionSafe?.(
      ecsWorld,
      { x, y, z },
      PLAYER_CONFIG.RADIUS,
      PLAYER_CONFIG.HEIGHT,
      entity
    ) ?? false;
  }

  _findSpawn(ecsWorld, entity) {
    const map = WORLD_CONFIG.MAP;
    const halfWidth = Math.max(1, map.WIDTH / 2 - PLAYER_CONFIG.RADIUS - 0.5);
    const halfLength = Math.max(1, map.LENGTH / 2 - PLAYER_CONFIG.RADIUS - 0.5);
    const y = WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2 + 0.04;

    // Respawns are intentionally randomized rather than cycling through fixed
    // points. The authoritative host chooses the position; clients receive it
    // through the normal world snapshot, so there is only one source of truth.
    const attempts = 96;
    for (let i = 0; i < attempts; i++) {
      const x = THREE.MathUtils.randFloat(-halfWidth, halfWidth);
      const z = THREE.MathUtils.randFloat(-halfLength, halfLength);
      if (this._isSpawnFree(ecsWorld, entity, x, y, z)) {
        return { x, y, z };
      }
    }

    // If the random search is saturated, fall back to configured spawn points,
    // but still validate every point against the real physics world. Never
    // teleport into a mesh merely because a configured point exists.
    const configured = WORLD_CONFIG.PLAYER.SPAWN_POINTS || [];
    const offset = Math.floor(Math.random() * Math.max(1, configured.length));
    for (let i = 0; i < configured.length; i++) {
      const point = configured[(offset + i) % configured.length];
      const px = Number(point.x) || 0;
      const pz = Number(point.z) || 0;
      if (this._isSpawnFree(ecsWorld, entity, px, y, pz)) {
        return { x: px, y, z: pz };
      }
    }

    // Last-resort search around the map center. It is bounded and physics
    // validated; if no valid location exists, keep the player at its current
    // position rather than injecting it into world geometry.
    const current = entity.transform?.position;
    if (current && this._isSpawnFree(ecsWorld, entity, current.x, y, current.z)) {
      return { x: current.x, y, z: current.z };
    }

    return null;
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
      if (player) {
        const maxHealth = Math.max(1, Number(player.maxHealth) || PLAYER_CONFIG.MAX_HEALTH || 100);
        const health = Math.max(0, Number(player.health) || 0);

        // Keep impact visuals synchronized even while dead. The old logic only
        // updated living players, so a host-side target could respawn at 100 HP
        // while its old blood/bullet-hole decals remained visible.
        updatePlayerImpactMarksForHealth(ecsWorld, entity, health, maxHealth);

        if (health >= maxHealth) {
          clearPlayerImpactMarks(ecsWorld, entity, 1);
        }
      }

      if (player && !player.isDead) {
        const maxHealth = Math.max(1, Number(player.maxHealth) || PLAYER_CONFIG.MAX_HEALTH || 100);
        const health = Math.max(0, Number(player.health) || 0);
        const delay = Math.max(0, Number(GAME_CONFIG.HEALTH_REGEN?.DELAY_MS) || 3500);
        const rate = Math.max(0, Number(GAME_CONFIG.HEALTH_REGEN?.RATE_PER_SECOND) || 12);
        if (health < maxHealth && now - (Number(player.lastDamagedAt) || 0) >= delay) {
          const previousHealth = health;
          const delta = Math.min(maxHealth - health, rate / 60);
          player.health = health + delta;

          // Body impacts are driven directly by the player's current health.
          // This makes the visual state deterministic: every point of healing
          // immediately reduces impact visibility, regardless of frame rate or
          // how many marks exist.
          updatePlayerImpactMarksForHealth(
            ecsWorld,
            entity,
            player.health,
            maxHealth
          );

          // Once fully healed, remove the mark entities to reclaim GPU/CPU
          // resources instead of keeping invisible decals alive.
          if (player.health >= maxHealth) {
            clearPlayerImpactMarks(ecsWorld, entity, 1);
            player.impactMarkClearAccumulator = 0;
          }
        }
      }
      if (!player?.isDead) continue;

      const respawnDelay = GAME_CONFIG.RESPAWN_TIME_MS || 3000;
      if (now - (player.deathTime || 0) < respawnDelay) continue;

      const spawn = this._findSpawn(ecsWorld, entity);
      if (!spawn) {
        // No safe location exists this tick. Keep the player dead and retry on
        // the next health-system update instead of forcing an invalid teleport.
        continue;
      }

      player.isDead = false;
      player.health = player.maxHealth || PLAYER_CONFIG.MAX_HEALTH || 100;
      player.lastDamagedAt = now;
      player.impactMarkClearAccumulator = 0;
      player.respawnTimer = 0;

      // Respawn is a hard visual reset: a full-health player must not carry
      // body impact decals from the previous life.
      clearPlayerImpactMarks(ecsWorld, entity, 1);

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
