// src/ecs/systems/HealthSystem.js

import { GAME_CONFIG } from '../../config/constants.js';

/**
 * HealthSystem (Host-Only)
 * Damage queue, death, respawn.
 */
export class HealthSystem {
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
    this.pendingDamageEvents = [];
  }

  /**
   * @param {object} targetEntity
   * @param {number} amount
   * @param {string|number|null} [attackerId]
   */
  applyDamage(targetEntity, amount, attackerId = null) {
    if (!targetEntity) return;
    this.pendingDamageEvents.push({ targetEntity, amount, attackerId });
  }

  update(ecsWorld, damageQueue = null) {
    const now = performance.now();
    const queueToProcess = Array.isArray(damageQueue)
      ? damageQueue
      : this.pendingDamageEvents;

    if (queueToProcess && queueToProcess.length > 0) {
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

              if (entity.renderMesh?.mesh) {
                entity.renderMesh.mesh.visible = false;
              }
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

        // Refill weapon on respawn
        if (entity.weapon) {
          const cap = entity.weapon.maxAmmo || 12;
          entity.weapon.currentAmmo = cap;
          entity.weapon.ammo = cap;
          entity.weapon.isReloading = false;
        }
      }
    }
  }
}
