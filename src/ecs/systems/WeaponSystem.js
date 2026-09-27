// src/ecs/systems/WeaponSystem.js

import {
  INPUT_FLAGS,
  GAME_CONFIG,
  FIRE_MODE,
} from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { createBullet, createImpactDecal } from '../entities/createBullet.js';
import { copyWeaponState } from '../components/Weapon.js';
import { moveIntensity } from '../../utils/Movement.js';
import { audio } from '../../audio/AudioManager.js';

export class WeaponSystem {
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

  setRenderSystem(rs) {
    this.renderSystem = rs;
  }

  update(ecsWorld, nowMs = performance.now(), dt = 1 / 60) {
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

      // Weapon selection is authoritative on the host, but the same input
      // path is used locally for prediction/visual response.
      if (input.weaponSlot != null && input.weaponSlot >= 0) {
        this._trySwitchWeapon(entity, input.weaponSlot);
        input.weaponSlot = -1;
      }

      if (player.isDead) {
        weapon.shootHeldPrev = false;
        weapon.shotsInBurst = 0;
        weapon.currentSpread = 0;
        continue;
      }

      const wantShoot = hasFlag(input.inputMask || 0, INPUT_FLAGS.SHOOT);
      if (!wantShoot) {
        weapon.shotsInBurst = 0;
        weapon.currentSpread = Math.max(
          0,
          (weapon.currentSpread || 0) - (weapon.spreadDecay || 0.12) * dt
        );
      }

      if (weapon.isReloading) {
        if (now - weapon.reloadStartTime >= (weapon.reloadTimeMs || 1600)) {
          this._completeReload(weapon);
          weapon.justReloaded = true;
          if (player.isLocal) audio.playReloadEnd();
        }
      }

      const mask = input.inputMask || 0;
      const wantReload = hasFlag(mask, INPUT_FLAGS.RELOAD);
      const shootPressed = wantShoot && !weapon.shootHeldPrev;
      weapon.shootHeldPrev = wantShoot;

      if (!weapon.isReloading) {
        const mag = weapon.magazine ?? 0;
        const canReload =
          mag < (weapon.magazineSize || 12) && (weapon.reserveAmmo || 0) > 0;
        if ((wantReload || (wantShoot && mag <= 0)) && canReload) {
          weapon.isReloading = true;
          weapon.reloadStartTime = now;
          weapon.justStartedReload = true;
          if (player.isLocal) {
            audio.playReloadStart();
            this.renderSystem?.weaponViewModel?.onReloadStart?.();
          }
        }
      }

      if (!weapon.isReloading) {
        const mag = weapon.magazine ?? 0;
        const mode = weapon.fireMode || FIRE_MODE.SEMI;
        const cooled =
          now - (weapon.lastFiredTime || 0) >= (weapon.fireRateMs || 200);

        const shouldFire =
          mode === FIRE_MODE.AUTO ? wantShoot && cooled : shootPressed && cooled;

        if (shouldFire) {
          if (mag > 0) this._fireShot(ecsWorld, entity, now);
          else if (player.isLocal && shootPressed) audio.playEmptyClick();
        }
      }
    }
  }

  _trySwitchWeapon(entity, slotIndex) {
    if (!entity.loadout?.slots || !entity.weapon) return;
    const slots = entity.loadout.slots;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) return;
    if (entity.loadout.active === slotIndex) return;

    const cur = entity.loadout.active;
    if (slots[cur]) copyWeaponState(slots[cur], entity.weapon);

    entity.loadout.active = slotIndex;
    copyWeaponState(entity.weapon, slots[slotIndex]);
    entity.weapon.isReloading = false;
    entity.weapon.shotsInBurst = 0;
    entity.weapon.currentSpread = 0;

    if (entity.player?.isLocal) {
      this.renderSystem?.weaponViewModel?.setWeaponType?.(entity.weapon.typeId);
      audio.playReloadEnd();
    }
  }

  _completeReload(weapon) {
    const size = weapon.magazineSize || 12;
    const mag = weapon.magazine ?? 0;
    const need = size - mag;
    const take = Math.min(need, weapon.reserveAmmo || 0);
    weapon.magazine = mag + take;
    weapon.reserveAmmo = (weapon.reserveAmmo || 0) - take;
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

    const aimYaw = input.yaw || 0;
    const aimPitch = input.pitch || 0;
    const isFirstInBurst = (weapon.shotsInBurst || 0) === 0;
    const bloom = isFirstInBurst ? 0 : weapon.currentSpread || 0;
    const baseSpread = isFirstInBurst ? 0 : weapon.spreadBase || 0;
    const intensity = moveIntensity(physics?.velocity);
    const moveSpread = intensity * (GAME_CONFIG.MOVE_SPREAD_MAX ?? 0.035);

    weapon.magazine = Math.max(0, (weapon.magazine ?? 1) - 1);
    weapon.ammo = weapon.magazine;
    weapon.currentAmmo = weapon.magazine;
    weapon.lastFiredTime = now;
    weapon.justFired = true;

    if (player.isLocal) {
      audio.playShoot(weapon.sfx || 'pistol');
      this.renderSystem?.weaponViewModel?.onFired?.(
        0.1 + (weapon.recoilPitch || 0) * 2
      );
    }

    const pelletCount = Math.max(1, weapon.pelletCount || 1);
    const range = weapon.range || 100;
    const exclude = physics?.collider || null;

    let origin;
    if (player.isLocal && this.renderSystem?.weaponViewModel?.getMuzzleWorldPosition) {
      origin = this.renderSystem.weaponViewModel.getMuzzleWorldPosition();
    } else {
      const eyeY = GAME_CONFIG.CAMERA_HEIGHT_OFFSET || 1.6;
      const cosP = Math.cos(aimPitch);
      origin = {
        x: transform.position.x - Math.sin(aimYaw) * cosP * 0.45,
        y: transform.position.y + eyeY - 0.1,
        z: transform.position.z - Math.cos(aimYaw) * cosP * 0.45,
      };
    }

    for (let p = 0; p < pelletCount; p++) {
      let yawOff = 0;
      let pitchOff = 0;
      if (pelletCount > 1) {
        const s = weapon.spreadBase || 0.04;
        yawOff = (Math.random() * 2 - 1) * s;
        pitchOff = (Math.random() * 2 - 1) * s;
      } else {
        const spread = baseSpread + bloom + moveSpread;
        if (spread > 0) {
          yawOff = (Math.random() * 2 - 1) * spread;
          pitchOff = (Math.random() * 2 - 1) * spread;
        }
      }

      const yaw = aimYaw + yawOff;
      const pitch = aimPitch + pitchOff;
      const cosPitch = Math.cos(pitch);
      const dir = {
        x: -Math.sin(yaw) * cosPitch,
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * cosPitch,
      };
      const dLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
      dir.x /= dLen; dir.y /= dLen; dir.z /= dLen;

      let endPos = {
        x: origin.x + dir.x * range,
        y: origin.y + dir.y * range,
        z: origin.z + dir.z * range,
      };
      let hitNormal = { x: -dir.x, y: -dir.y, z: -dir.z };
      let hitEntity = null;
      let hitRenderTarget = null;
      let didHit = false;

      if (this.physicsWorld?.castRay) {
        const hit = this.physicsWorld.castRay(origin, dir, range, exclude);
        if (hit) {
          didHit = true;
          endPos = hit.point;
          if (hit.normal) hitNormal = hit.normal;
          hitEntity = hit.entity === entity ? null : hit.entity;
          hitRenderTarget = hit.renderTarget || null;
        }
      }

      createBullet(ecsWorld, this.sceneManager, origin, endPos);
      if (didHit) {
        createImpactDecal(
          ecsWorld,
          this.sceneManager,
          endPos,
          hitNormal,
          hitRenderTarget
        );
        if (player.isLocal && p === 0) audio.playImpact();
      }

      if (
        this.isAuthoritative &&
        this.healthSystem &&
        hitEntity?.player &&
        !hitEntity.player.isDead
      ) {
        const dmg = weapon.damage || 20;
        if ((hitEntity.player.health || 0) - dmg <= 0) {
          player.kills = (player.kills || 0) + 1;
        }
        this.healthSystem.applyDamage(hitEntity, dmg, player.id);
        if (player.isLocal && p === 0) audio.playHit();
      }
    }

    const yawKick =
      (Math.random() * 2 - 1) * (weapon.recoilYawSpread || 0.01);
    const pitchKick = weapon.recoilPitch || 0.04;
    weapon.cameraRecoilPitch = (weapon.cameraRecoilPitch || 0) + pitchKick;
    weapon.cameraRecoilYaw = (weapon.cameraRecoilYaw || 0) + yawKick;
    input.pitch = Math.min((89 * Math.PI) / 180, aimPitch + pitchKick * 0.65);
    input.yaw = aimYaw + yawKick * 0.35;

    weapon.shotsInBurst = (weapon.shotsInBurst || 0) + 1;
    weapon.currentSpread = Math.min(
      weapon.spreadMax || 0.05,
      (weapon.currentSpread || 0) + (weapon.spreadGrow || 0.01)
    );
  }
}
