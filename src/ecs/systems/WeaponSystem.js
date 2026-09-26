// src/ecs/systems/WeaponSystem.js

import { INPUT_FLAGS, GAME_CONFIG } from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { createBullet, createImpact } from '../entities/createBullet.js';

/**
 * WeaponSystem
 * Hitscan pistol: fire rate, ammo, reload, tracers, impact FX, host damage.
 *
 * @param {boolean} isAuthoritative - when true, apply HealthSystem damage (host).
 *   Clients still run this for local tracers / ammo / reload feedback.
 */
export class WeaponSystem {
  /**
   * @param {object} physicsWorld
   * @param {object} sceneManager - SceneManager or THREE.Scene
   * @param {object|null} healthSystem - host HealthSystem (null on pure client)
   * @param {boolean} [isAuthoritative=false]
   */
  constructor(physicsWorld, sceneManager, healthSystem = null, isAuthoritative = false) {
    this.physicsWorld = physicsWorld;
    this.sceneManager = sceneManager;
    this.healthSystem = healthSystem;
    this.isAuthoritative = isAuthoritative;

    /** Track previous SHOOT bit so we still support hold-to-fire via fire-rate gate */
    this._wasShooting = new WeakMap();
  }

  /**
   * @param {object} ecsWorld
   * @param {number} [nowMs]
   */
  update(ecsWorld, nowMs = performance.now()) {
    const now = nowMs;
    const players = ecsWorld.with('player', 'transform', 'input', 'weapon');

    for (const entity of players) {
      const player = entity.player;
      const transform = entity.transform;
      const input = entity.input;
      const weapon = entity.weapon;

      if (!player || !transform || !input || !weapon) continue;
      if (player.isDead) continue;

      // --- Reload completion ---
      if (weapon.isReloading) {
        if (now - weapon.reloadStartTime >= (weapon.reloadTimeMs || 1500)) {
          const cap = weapon.maxAmmo || 12;
          weapon.currentAmmo = cap;
          weapon.ammo = cap;
          weapon.isReloading = false;
        }
      }

      const mask = input.inputMask || 0;
      const wantReload = hasFlag(mask, INPUT_FLAGS.RELOAD);
      const wantShoot = hasFlag(mask, INPUT_FLAGS.SHOOT);

      // --- Start reload (R, or empty + fire) ---
      if (!weapon.isReloading) {
        const empty = (weapon.ammo ?? weapon.currentAmmo ?? 0) <= 0;
        if (wantReload || (wantShoot && empty)) {
          if ((weapon.ammo ?? weapon.currentAmmo) < (weapon.maxAmmo || 12)) {
            weapon.isReloading = true;
            weapon.reloadStartTime = now;
          }
        }
      }

      // --- Fire ---
      if (wantShoot && !weapon.isReloading) {
        const ammo = weapon.ammo ?? weapon.currentAmmo ?? 0;
        const fireRate = weapon.fireRateMs || 200;
        const canFire =
          ammo > 0 && now - (weapon.lastFiredTime || 0) >= fireRate;

        if (canFire) {
          this._fireShot(ecsWorld, entity, now);
        }
      }
    }
  }

  /**
   * Perform one hitscan shot for a player entity.
   * @private
   */
  _fireShot(ecsWorld, entity, now) {
    const player = entity.player;
    const transform = entity.transform;
    const input = entity.input;
    const weapon = entity.weapon;
    const physics = entity.physics;

    // Consume ammo
    const ammo = (weapon.ammo ?? weapon.currentAmmo ?? 0) - 1;
    weapon.currentAmmo = Math.max(0, ammo);
    weapon.ammo = weapon.currentAmmo;
    weapon.lastFiredTime = now;

    // Look direction from pitch/yaw (matches FPS camera YXZ)
    const yaw = input.yaw || 0;
    const pitch = input.pitch || 0;
    const cosPitch = Math.cos(pitch);
    const dir = {
      x: -Math.sin(yaw) * cosPitch,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cosPitch,
    };
    // normalize
    const dLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= dLen;
    dir.y /= dLen;
    dir.z /= dLen;

    // Eye origin (same as camera)
    const eyeY = (GAME_CONFIG.CAMERA_HEIGHT_OFFSET || 1.6);
    const origin = {
      x: transform.position.x + dir.x * 0.35,
      y: transform.position.y + eyeY,
      z: transform.position.z + dir.z * 0.35,
    };

    const range = weapon.range || 100;
    const exclude = physics?.collider || null;

    let endPos = {
      x: origin.x + dir.x * range,
      y: origin.y + dir.y * range,
      z: origin.z + dir.z * range,
    };
    let hitNormal = { x: 0, y: 1, z: 0 };
    let hitEntity = null;

    if (this.physicsWorld?.castRay) {
      const hit = this.physicsWorld.castRay(origin, dir, range, exclude);
      if (hit) {
        endPos = hit.point;
        hitNormal = hit.normal || hitNormal;
        hitEntity = hit.entity;
        // Ignore self
        if (hitEntity === entity) {
          hitEntity = null;
          endPos = {
            x: origin.x + dir.x * range,
            y: origin.y + dir.y * range,
            z: origin.z + dir.z * range,
          };
        }
      }
    }

    // Visual tracer (everyone who runs this system)
    createBullet(ecsWorld, this.sceneManager, origin, endPos);
    createImpact(ecsWorld, this.sceneManager, endPos, hitNormal);

    // Authoritative damage (host only)
    if (
      this.isAuthoritative &&
      this.healthSystem &&
      hitEntity &&
      hitEntity.player &&
      !hitEntity.player.isDead
    ) {
      const dmg = weapon.damage || 25;
      this.healthSystem.applyDamage(hitEntity, dmg, player.id);

      // Kill credit when this shot would lethal-hit (HealthSystem applies next)
      // Approximate: if health - dmg <= 0, bump attacker kills on next frame via HealthSystem
      // Handle here for immediate feedback:
      if ((hitEntity.player.health || 0) - dmg <= 0) {
        player.kills = (player.kills || 0) + 1;
      }
    }
  }
}
