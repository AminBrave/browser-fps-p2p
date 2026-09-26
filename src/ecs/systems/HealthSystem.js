// src/ecs/systems/HealthSystem.js

import { GAME_CONFIG } from '../../config/constants.js';

/**
 * HealthSystem (Authoritative / Host-Only)
 * Processes entity damage, health regeneration/deduction, respawn timer logic,
 * and resets physics positions upon player elimination.
 */
export class HealthSystem {
  /**
   * @param {object} physicsWorld - Wrapper class for Rapier3D.
   */
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
    this.pendingDamageEvents = []; // Array of { targetEntity, amount, attackerId }
  }

  /**
   * Enqueues a damage event to be processed on the next system update tick.
   * 
   * @param {object} targetEntity - The Miniplex entity receiving damage.
   * @param {number} amount - Amount of health points to deduct.
   * @param {string|number} [attackerId] - ID of the player dealing damage.
   */
  applyDamage(targetEntity, amount, attackerId = null) {
    if (!targetEntity) return;
    this.pendingDamageEvents.push({ targetEntity, amount, attackerId });
  }

  /**
   * Main system update loop executed every physics/logic step.
   * Supports both Miniplex v2 world queries and flexible argument signatures.
   * 
   * @param {object} ecsWorld - The Miniplex ECS world instance.
   * @param {Array} [damageQueue] - Optional external array of damage events.
   */
  update(ecsWorld, damageQueue = null) {
    const now = performance.now();

    // 1. Process externally passed damage queue or local pending damage events
    const queueToProcess = Array.isArray(damageQueue) ? damageQueue : this.pendingDamageEvents;

    if (queueToProcess && queueToProcess.length > 0) {
      while (queueToProcess.length > 0) {
        const event = queueToProcess.shift();
        const entity = event.targetEntity || event.entity;

        if (entity && entity.player) {
          const player = entity.player;

          if (!player.isDead) {
            player.health = Math.max(0, player.health - (event.amount || 0));

            if (player.health <= 0) {
              player.isDead = true;
              player.deathTime = now;
              player.deaths = (player.deaths || 0) + 1;

              // Hide render mesh on death if present
              if (entity.renderMesh && entity.renderMesh.mesh) {
                entity.renderMesh.mesh.visible = false;
              }
            }
          }
        }
      }
    }

    // 2. Query all active players in Miniplex v2 to manage respawns & state
    const players = ecsWorld.with('player', 'transform');

    for (const entity of players) {
      const player = entity.player;
      const transform = entity.transform;
      const physics = entity.physics;

      if (!player || !player.isDead) continue;

      // Handle Respawn Delay Logic
      const respawnDelay = GAME_CONFIG.RESPAWN_TIME_MS || 3000;
      if (now - player.deathTime >= respawnDelay) {
        player.isDead = false;
        player.health = player.maxHealth || GAME_CONFIG.MAX_HEALTH || 100;

        // Reset spawn position (Randomized offset around origin)
        const spawnX = (Math.random() - 0.5) * 10;
        const spawnY = 3.0;
        const spawnZ = (Math.random() - 0.5) * 10;

        transform.position.x = spawnX;
        transform.position.y = spawnY;
        transform.position.z = spawnZ;

        // Reset Rapier physics rigid body or character controller position
        if (physics) {
          if (physics.rigidBody && typeof physics.rigidBody.setTranslation === 'function') {
            physics.rigidBody.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);
          } else if (physics.controller && typeof physics.controller.setTranslation === 'function') {
            physics.controller.setTranslation({ x: spawnX, y: spawnY, z: spawnZ });
          }
        }

        // Restore mesh visibility (Keep hidden for local player FPS view)
        if (entity.renderMesh && entity.renderMesh.mesh) {
          entity.renderMesh.mesh.visible = !player.isLocal;
        }
      }
    }
  }
}