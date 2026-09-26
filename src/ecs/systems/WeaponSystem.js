// src/ecs/systems/WeaponSystem.js

import { INPUT_FLAGS, GAME_CONFIG, FIRE_MODE } from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { createBullet, createImpactDecal } from '../entities/createBullet.js';
import { audio } from '../../audio/AudioManager.js';

/**
 * Hitscan weapon: semi/auto, magazine+reserve reload, muzzle origin, recoil, SFX.
 */
export class WeaponSystem {
  /**
   * @param {object} physicsWorld
   * @param {object} sceneManager
   * @param {object|null} healthSystem
   * @param {boolean} isAuthoritative
   * @param {object|null} renderSystem - optional, for muzzle world pos + viewmodel kick
   */
  constructor(
    physicsWorld,
    sceneManager,
    healthSystem = null,
    isAuthoritative = false,
    renderSystem = null
  ) {
    this.physicsWorld = physicsWorld;
    this.sceneManager = sceneManager;
    this.healthSystem = healthSystem;
    this.isAuthoritative = isAuthoritative;
    this.renderSystem = renderSystem;
  }

  setRenderSystem(renderSystem) {
    this.renderSystem = renderSystem;
  }

  update(ecsWorld, nowMs = performance.now()) {
    const now = nowMs;

    for (const entity of ecsWorld.with('player', 'transform', 'input', 'weapon')) {
      const player = entity.player;
      const transform = entity.transform;
      const input = entity.input;
      const weapon = entity.weapon;

      if (!player || !transform || !input || !weapon) continue;

      weapon.justFired = false;
      weapon.justReloaded = false;
      weapon.justStartedReload = false;

      if (player.isDead) {
        weapon.shootHeldPrev = false;
        continue;
      }

      // --- Finish reload ---
      if (weapon.isReloading) {
        if (now - weapon.reloadStartTime >= (weapon.reloadTimeMs || 1600)) {
          this._completeReload(weapon);
          weapon.justReloaded = true;
          if (player.isLocal) audio.playReloadEnd();
        }
      }

      const mask = input.inputMask || 0;
      const wantReload = hasFlag(mask, INPUT_FLAGS.RELOAD);
      const wantShoot = hasFlag(mask, INPUT_FLAGS.SHOOT);
      const shootPressed = wantShoot && !weapon.shootHeldPrev;
      weapon.shootHeldPrev = wantShoot;

      // --- Start reload ---
      if (!weapon.isReloading) {
        const mag = weapon.magazine ?? weapon.ammo ?? 0;
        const empty = mag <= 0;
        const canReload =
          mag < (weapon.magazineSize || weapon.maxAmmo || 12) &&
          (weapon.reserveAmmo || 0) > 0;

        if ((wantReload || (wantShoot && empty)) && canReload) {
          weapon.isReloading = true;
          weapon.reloadStartTime = now;
          weapon.justStartedReload = true;
          if (player.isLocal) {
            audio.playReloadStart();
            this.renderSystem?.weaponViewModel?.onReloadStart?.();
          }
        }
      }

      // --- Fire (semi = edge, auto = hold) ---
      if (!weapon.isReloading) {
        const mag = weapon.magazine ?? weapon.ammo ?? 0;
        const mode = weapon.fireMode || FIRE_MODE.SEMI;
        const fireRate = weapon.fireRateMs || 180;
        const cooled = now - (weapon.lastFiredTime || 0) >= fireRate;

        let shouldFire = false;
        if (mode === FIRE_MODE.AUTO) {
          shouldFire = wantShoot && cooled;
        } else {
          shouldFire = shootPressed && cooled;
        }

        if (shouldFire) {
          if (mag > 0) {
            this._fireShot(ecsWorld, entity, now);
          } else if (player.isLocal && shootPressed) {
            audio.playEmptyClick();
          }
        }
      }
    }
  }

  _completeReload(weapon) {
    const size = weapon.magazineSize || weapon.maxAmmo || 12;
    const mag = weapon.magazine ?? weapon.ammo ?? 0;
    const need = size - mag;
    const take = Math.min(need, weapon.reserveAmmo || 0);
    weapon.magazine = mag + take;
    weapon.reserveAmmo = (weapon.reserveAmmo || 0) - take;
    // Keep aliases in sync for any legacy reads
    weapon.ammo = weapon.magazine;
    weapon.currentAmmo = weapon.magazine;
    weapon.maxAmmo = size;
    weapon.isReloading = false;
  }

  _fireShot(ecsWorld, entity, now) {
    const player = entity.player;
    const transform = entity.transform;
    const input = entity.input;
    const weapon = entity.weapon;
    const physics = entity.physics;

    weapon.magazine = Math.max(0, (weapon.magazine ?? 1) - 1);
    weapon.ammo = weapon.magazine;
    weapon.currentAmmo = weapon.magazine;
    weapon.lastFiredTime = now;
    weapon.justFired = true;

    // Recoil punch on camera (local)
    const yawKick =
      ((Math.random() * 2 - 1) * (weapon.recoilYawSpread || 0.01));
    const pitchKick = weapon.recoilPitch || 0.04;
    weapon.cameraRecoilPitch = (weapon.cameraRecoilPitch || 0) + pitchKick;
    weapon.cameraRecoilYaw = (weapon.cameraRecoilYaw || 0) + yawKick;
    // Also nudge look angles slightly so next shot blooms
    input.pitch = Math.min(
      (89 * Math.PI) / 180,
      (input.pitch || 0) + pitchKick * 0.85
    );
    input.yaw = (input.yaw || 0) + yawKick * 0.5;

    if (player.isLocal) {
      audio.playShoot();
      this.renderSystem?.weaponViewModel?.onFired?.(0.14);
    }

    // Aim direction (after recoil applied to input)
    const yaw = input.yaw || 0;
    const pitch = input.pitch || 0;
    const cosPitch = Math.cos(pitch);
    const dir = {
      x: -Math.sin(yaw) * cosPitch,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cosPitch,
    };
    const dLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= dLen;
    dir.y /= dLen;
    dir.z /= dLen;

    // Muzzle origin: prefer viewmodel world pos for local player
    let origin;
    if (player.isLocal && this.renderSystem?.weaponViewModel?.getMuzzleWorldPosition) {
      origin = this.renderSystem.weaponViewModel.getMuzzleWorldPosition();
    } else {
      // Approximate muzzle for remote: eye + forward offset
      const eyeY = GAME_CONFIG.CAMERA_HEIGHT_OFFSET || 1.6;
      origin = {
        x: transform.position.x + dir.x * 0.5,
        y: transform.position.y + eyeY - 0.12,
        z: transform.position.z + dir.z * 0.5,
      };
    }

    const range = weapon.range || 120;
    const exclude = physics?.collider || null;

    let endPos = {
      x: origin.x + dir.x * range,
      y: origin.y + dir.y * range,
      z: origin.z + dir.z * range,
    };
    let hitNormal = { x: 0, y: 1, z: 0 };
    let hitEntity = null;
    let didHit = false;

    if (this.physicsWorld?.castRay) {
      const hit = this.physicsWorld.castRay(origin, dir, range, exclude);
      if (hit) {
        didHit = true;
        endPos = hit.point;
        hitNormal = hit.normal || hitNormal;
        hitEntity = hit.entity === entity ? null : hit.entity;
      }
    }

    createBullet(ecsWorld, this.sceneManager, origin, endPos);
    if (didHit) {
      createImpactDecal(ecsWorld, this.sceneManager, endPos, hitNormal);
      if (player.isLocal) audio.playImpact();
    }

    if (
      this.isAuthoritative &&
      this.healthSystem &&
      hitEntity?.player &&
      !hitEntity.player.isDead
    ) {
      const dmg = weapon.damage || 25;
      if ((hitEntity.player.health || 0) - dmg <= 0) {
        player.kills = (player.kills || 0) + 1;
      }
      this.healthSystem.applyDamage(hitEntity, dmg, player.id);
      if (player.isLocal) audio.playHit();
    }
  }
}
