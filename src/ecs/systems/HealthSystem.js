// src/ecs/systems/HealthSystem.js

import { GAME_CONFIG } from '../../config/constants.js';

/**
 * HealthSystem (Host-Only)
 * Handles weapon firing input verification, raycast hit detection, health updates,
 * death/respawn state transitions, and damage event propagation across the network.
 */
export class HealthSystem {
  /**
   * @param {object} physicsWorld - The Rapier3D physics wrapper instance.
   * @param {function} onDamageCallback - Callback to broadcast hit events via network.
   * @param {function} onSpawnBulletCallback - Callback to spawn hitscan tracer visuals.
   */
  constructor(physicsWorld, onDamageCallback, onSpawnBulletCallback) {
    this.physicsWorld = physicsWorld;
    this.onDamageCallback = onDamageCallback;
    this.onSpawnBulletCallback = onSpawnBulletCallback;
  }

  /**
   * Executes health, firing rate, raycast hit detection, and respawn logic.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {Array<number>} playerEntities - All active player entity IDs.
   * @param {number} currentTime - Current timestamp in milliseconds.
   */
  update(ecsWorld, playerEntities, currentTime) {
    for (let i = 0; i < playerEntities.length; i++) {
      const entityId = playerEntities[i];
      const playerComp = ecsWorld.getComponent(entityId, 'Player');
      const transformComp = ecsWorld.getComponent(entityId, 'Transform');
      const weaponComp = ecsWorld.getComponent(entityId, 'Weapon');
      const inputComp = ecsWorld.getComponent(entityId, 'Input');

      if (!playerComp || !transformComp || !weaponComp || !inputComp) continue;

      // 1. Check for Respawn state
      if (playerComp.isDead) {
        if (currentTime - playerComp.deathTimestamp >= GAME_CONFIG.RESPAWN_TIME_MS) {
          this._respawnPlayer(playerComp, transformComp);
        }
        continue;
      }

      // 2. Weapon Reload Cooldown Logic
      if (weaponComp.isReloading) {
        if (currentTime - weaponComp.reloadStartTimestamp >= GAME_CONFIG.WEAPON.RELOAD_TIME_MS) {
          weaponComp.ammo = GAME_CONFIG.WEAPON.MAGAZINE_SIZE;
          weaponComp.isReloading = false;
        }
      }

      // Handle Manual Reload Action
      if ((inputComp.inputMask & (1 << 6)) !== 0 && weaponComp.ammo < GAME_CONFIG.WEAPON.MAGAZINE_SIZE && !weaponComp.isReloading) {
        weaponComp.isReloading = true;
        weaponComp.reloadStartTimestamp = currentTime;
      }

      // 3. Fire Weapon Input Handling
      const isShootingPressed = (inputComp.inputMask & (1 << 4)) !== 0; // SHOOT Flag
      const canFire = isShootingPressed && 
                        !weaponComp.isReloading && 
                        weaponComp.ammo > 0 && 
                        (currentTime - weaponComp.lastFiredTimestamp >= GAME_CONFIG.WEAPON.FIRE_RATE_MS);

      if (canFire) {
        weaponComp.ammo--;
        weaponComp.lastFiredTimestamp = currentTime;

        // Auto-trigger reload if magazine emptied
        if (weaponComp.ammo <= 0) {
          weaponComp.isReloading = true;
          weaponComp.reloadStartTimestamp = currentTime;
        }

        // Perform Hitscan Raycast Simulation
        this._processHitscan(ecsWorld, playerEntities, entityId, transformComp, inputComp);
      }
    }
  }

  /**
   * Performs hitscan raycast from player aim vector against physics colliders.
   * @private
   */
  _processHitscan(ecsWorld, playerEntities, shooterEntityId, shooterTransform, shooterInput) {
    const origin = {
      x: shooterTransform.position.x,
      y: shooterTransform.position.y + GAME_CONFIG.CAMERA_EYE_HEIGHT,
      z: shooterTransform.position.z,
    };

    // Calculate normalized direction vector using pitch and yaw look angles
    const dirX = -Math.sin(shooterInput.yaw) * Math.cos(shooterInput.pitch);
    const dirY = Math.sin(shooterInput.pitch);
    const dirZ = -Math.cos(shooterInput.yaw) * Math.cos(shooterInput.pitch);

    const hitResult = this.physicsWorld.castRay(origin, { x: dirX, y: dirY, z: dirZ }, GAME_CONFIG.WEAPON.MAX_RANGE);

    let endPoint = {
      x: origin.x + dirX * GAME_CONFIG.WEAPON.MAX_RANGE,
      y: origin.y + dirY * GAME_CONFIG.WEAPON.MAX_RANGE,
      z: origin.z + dirZ * GAME_CONFIG.WEAPON.MAX_RANGE,
    };

    if (hitResult) {
      endPoint = hitResult.point;

      // Check if the hit collider belongs to a player entity
      for (let j = 0; j < playerEntities.length; j++) {
        const victimEntityId = playerEntities[j];
        if (victimEntityId === shooterEntityId) continue; // Prevent self-harm

        const victimPhys = ecsWorld.getComponent(victimEntityId, 'Physics');
        const victimPlayer = ecsWorld.getComponent(victimEntityId, 'Player');

        if (victimPhys && victimPhys.collider === hitResult.collider && victimPlayer && !victimPlayer.isDead) {
          // Apply Damage
          victimPlayer.health = Math.max(0, victimPlayer.health - GAME_CONFIG.WEAPON.DAMAGE);

          if (this.onDamageCallback) {
            this.onDamageCallback(victimPlayer.id, victimPlayer.health, GAME_CONFIG.WEAPON.DAMAGE);
          }

          // Check Player Death
          if (victimPlayer.health <= 0) {
            victimPlayer.isDead = true;
            victimPlayer.deathTimestamp = performance.now();
            victimPlayer.deaths++;

            const shooterPlayer = ecsWorld.getComponent(shooterEntityId, 'Player');
            if (shooterPlayer) shooterPlayer.kills++;
          }
          break;
        }
      }
    }

    // Spawn tracer visual on all clients
    if (this.onSpawnBulletCallback) {
      this.onSpawnBulletCallback(origin, endPoint);
    }
  }

  /**
   * Resets player health and teleports entity to a spawn location.
   * @private
   */
  _respawnPlayer(playerComp, transformComp) {
    playerComp.health = GAME_CONFIG.MAX_HEALTH;
    playerComp.isDead = false;

    // Pick a random spawn coordinate from pool
    const spawnIndex = Math.floor(Math.random() * GAME_CONFIG.SPAWN_POINTS.length);
    const spawn = GAME_CONFIG.SPAWN_POINTS[spawnIndex];

    transformComp.position.x = spawn.x;
    transformComp.position.y = spawn.y;
    transformComp.position.z = spawn.z;
  }
}