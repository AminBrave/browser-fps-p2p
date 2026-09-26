// src/ecs/systems/HealthSystem.js

import { GAME_CONFIG, DEFAULT_WEAPON } from '../../config/constants.js';
import { audio } from '../../audio/AudioManager.js';

export class HealthSystem {
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
    this.pendingDamageEvents = [];
  }

  applyDamage(targetEntity, amount, attackerId = null) {
    if (!targetEntity) return;
    this.pendingDamageEvents.push({ targetEntity, amount, attackerId });
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
        if (entity?.player) {
          const player = entity.player;
          if (!player.isDead) {
            const before = player.health;
            player.health = Math.max(0, player.health - (event.amount || 0));
            if (player.health <= 0 && before > 0) {
              player.isDead = true;
              player.deathTime = now;
              player.deaths = (player.deaths || 0) + 1;
              if (entity.renderMesh?.mesh) entity.renderMesh.mesh.visible = false;
              if (player.isLocal) audio.playDeath();
            }
          }
        }
      }
    }

    for (const entity of ecsWorld.with('player', 'transform')) {
      const player = entity.player;
      const transform = entity.transform;
      const physics = entity.physics;
      if (!player?.isDead) continue;

      const respawnDelay = GAME_CONFIG.RESPAWN_TIME_MS || 3000;
      if (now - (player.deathTime || 0) >= respawnDelay) {
        player.isDead = false;
        player.health = player.maxHealth || GAME_CONFIG.MAX_HEALTH || 100;

        const spawnX = (Math.random() - 0.5) * 10;
        const spawnY = 3.0;
        const spawnZ = (Math.random() - 0.5) * 10;
        transform.position.x = spawnX;
        transform.position.y = spawnY;
        transform.position.z = spawnZ;

        if (physics?.rigidBody?.setTranslation) {
          physics.rigidBody.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);
        } else if (physics?.rigidBody?.setNextKinematicTranslation) {
          physics.rigidBody.setNextKinematicTranslation({
            x: spawnX,
            y: spawnY,
            z: spawnZ,
          });
        }

        if (entity.renderMesh?.mesh) {
          entity.renderMesh.mesh.visible = !player.isLocal;
        }

        if (entity.weapon) {
          const size =
            entity.weapon.magazineSize ||
            DEFAULT_WEAPON.MAGAZINE_SIZE ||
            12;
          const reserve =
            DEFAULT_WEAPON.RESERVE_AMMO ?? size * 3;
          entity.weapon.magazine = size;
          entity.weapon.magazineSize = size;
          entity.weapon.reserveAmmo = reserve;
          entity.weapon.ammo = size;
          entity.weapon.currentAmmo = size;
          entity.weapon.maxAmmo = size;
          entity.weapon.isReloading = false;
        }
      }
    }
  }
}
