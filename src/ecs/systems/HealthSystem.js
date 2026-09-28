// src/ecs/systems/HealthSystem.js

import { GAME_CONFIG, PLAYER_CONFIG, DEFAULT_WEAPON } from '../../config/index.js';
import { WORLD_CONFIG } from '../../config/index.js';
import { EVENT_TYPES } from '../../network/PacketTypes.js';
import { applyDamageToHealth, calculateHealthRegen } from '../../game/simulation/combat/HealthModel.js';

export class HealthSystem {
  constructor(physicsWorld, eventSink = null) {
    this.physicsWorld = physicsWorld;
    this.eventSink = eventSink;
    this.presentationEvents = [];
    this.pendingDamageEvents = [];
    this.spawnCursor = 0;
  }

  _emitPresentation(event) { this.presentationEvents.push(Object.freeze(event)); }

  drainPresentationEvents() { const events = this.presentationEvents; this.presentationEvents = []; return events; }

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

    // Respawns are randomized, while the authoritative physics world decides
    // whether each candidate has enough clearance from real world geometry.
    for (let i = 0; i < 96; i++) {
      const x = -halfWidth + Math.random() * (halfWidth * 2);
      const z = -halfLength + Math.random() * (halfLength * 2);
      if (this._isSpawnFree(ecsWorld, entity, x, y, z)) {
        return { x, y, z };
      }
    }

    // Validate configured points as a fallback. Never force a spawn into
    // geometry merely because the point is configured.
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

    // If the map is temporarily saturated, keep the player dead and retry
    // rather than injecting the character into another object's collider.
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

        const damageResult = applyDamageToHealth(player.health, event.amount);
        const before = damageResult.previousHealth;
        const damage = damageResult.damage;
        player.health = damageResult.health;
        if (damage > 0 && event.attackerId != null) {
          player.lastDamagedBy = event.attackerId;
          player.lastDamagedAt = now;
        }
        if (damageResult.killed) {
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
          this._emitPresentation({ type: 'death', playerId: player.id, isLocal: !!player.isLocal });
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'death',
            sourceId: player.id,
            position: { ...entity.transform.position },
          });
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
        this._emitPresentation({ type: 'impactHealth', playerId: player.id, health, maxHealth });

        if (health >= maxHealth) {
          this._emitPresentation({ type: 'clearImpactMarks', playerId: player.id, fraction: 1 });
        }
      }

      if (player && !player.isDead) {
        const maxHealth = Math.max(1, Number(player.maxHealth) || PLAYER_CONFIG.MAX_HEALTH || 100);
        const health = Math.max(0, Number(player.health) || 0);
        const delay = Math.max(0, Number(GAME_CONFIG.HEALTH_REGEN?.DELAY_MS) || 3500);
        const rate = Math.max(0, Number(GAME_CONFIG.HEALTH_REGEN?.RATE_PER_SECOND) || 12);
        if (health < maxHealth && now - (Number(player.lastDamagedAt) || 0) >= delay) {
          const delta = calculateHealthRegen({
            health,
            maxHealth,
            elapsedMs: 1000 / 60,
            delayMs: delay,
            ratePerSecond: rate,
          });
          player.health = health + delta;

          // Body impacts are driven directly by the player's current health.
          // This makes the visual state deterministic: every point of healing
          // immediately reduces impact visibility, regardless of frame rate or
          // how many marks exist.
          this._emitPresentation({ type: 'impactHealth', playerId: player.id, health: player.health, maxHealth });

          // Once fully healed, remove the mark entities to reclaim GPU/CPU
          // resources instead of keeping invisible decals alive.
          if (player.health >= maxHealth) {
            this._emitPresentation({ type: 'clearImpactMarks', playerId: player.id, fraction: 1 });
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
      this._emitPresentation({ type: 'clearImpactMarks', playerId: player.id, fraction: 1 });

      transform.position.x = spawn.x;
      transform.position.y = spawn.y;
      transform.position.z = spawn.z;

      if (physics?.rigidBody?.setLinvel) {
        physics.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      physics?.rigidBody?.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
      physics?.rigidBody?.setTranslation?.(spawn, true);
      physics?.rigidBody?.setNextKinematicTranslation?.(spawn);

      this._emitPresentation({ type: 'respawn', playerId: player.id, isLocal: !!player.isLocal, spawn: { ...spawn } });

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
