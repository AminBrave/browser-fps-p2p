// src/ecs/systems/WeaponSystem.js

import {
  INPUT_FLAGS,
  GAME_CONFIG,
  FIRE_MODE,
} from '../../config/index.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { createBullet, createImpactDecal, createBloodImpact } from '../entities/createBullet.js';
import { copyWeaponState } from '../components/Weapon.js';
import { moveIntensity } from '../../utils/Movement.js';
import { audio } from '../../audio/AudioManager.js';
import { EVENT_TYPES } from '../../network/PacketTypes.js';

export class WeaponSystem {
  constructor(physicsWorld, sceneManager, healthSystem = null, isAuthoritative = false, renderSystem = null, eventSink = null) {
    this.physicsWorld = physicsWorld;
    this.sceneManager = sceneManager;
    this.healthSystem = healthSystem;
    this.isAuthoritative = isAuthoritative;
    this.renderSystem = renderSystem;
    this.eventSink = eventSink;
  }

  setEventSink(eventSink) {
    this.eventSink = eventSink;
  }

  _emit(event) {
    this.eventSink?.(event);
  }

  _getMuzzleWorldPosition(entity) {
    const player = entity.player;
    const transform = entity.transform;
    const input = entity.input;
    if (player?.isLocal && this.renderSystem?.weaponViewModel?.getMuzzleWorldPosition) {
      return this.renderSystem.weaponViewModel.getMuzzleWorldPosition();
    }

    const yaw = Number(input?.yaw ?? transform?.rotation?.yaw ?? 0);
    const stance = input?.stance ?? 0;
    const eyeOffset = stance === 2 ? 0.10 : stance === 1 ? 0.45 : 0.73;
    const forward = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const side = 0.22;
    const forwardDistance = 0.48;
    const y = (transform?.position?.y ?? 0) + eyeOffset - 0.55;
    return {
      x: (transform?.position?.x ?? 0) + right.x * side + forward.x * forwardDistance,
      y,
      z: (transform?.position?.z ?? 0) + right.z * side + forward.z * forwardDistance,
    };
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
          this._emit({ type: EVENT_TYPES.SFX, sfx: 'reloadEnd', sourceId: player.id, position: { ...transform.position } });
        }
      }

      const mask = input.inputMask || 0;
      const wantReload = hasFlag(mask, INPUT_FLAGS.RELOAD);
      const shootPressed = wantShoot && !weapon.shootHeldPrev;
      weapon.shootHeldPrev = wantShoot;

      if (!weapon.isReloading) {
        const mag = weapon.magazine ?? 0;
        const canReload = mag < (weapon.magazineSize || 12) && (weapon.reserveAmmo || 0) > 0;
        if ((wantReload || (wantShoot && mag <= 0)) && canReload) {
          weapon.isReloading = true;
          weapon.reloadStartTime = now;
          weapon.justStartedReload = true;
          if (player.isLocal) {
            audio.playReloadStart();
            this.renderSystem?.weaponViewModel?.onReloadStart?.();
          }
          // Emit exactly one reload-start event; keep this block balanced for Vite parsing.
          this._emit({ type: EVENT_TYPES.SFX, sfx: 'reloadStart', sourceId: player.id, position: { ...transform.position } });
        }
      }

      if (!weapon.isReloading) {
        const mag = weapon.magazine ?? 0;
        const mode = weapon.fireMode || FIRE_MODE.SEMI;
        const cooled = now - (weapon.lastFiredTime || 0) >= (weapon.fireRateMs || 200);
        const shouldFire = mode === FIRE_MODE.AUTO ? wantShoot && cooled : shootPressed && cooled;

        if (shouldFire) {
          if (mag > 0) this._fireShot(ecsWorld, entity, now);
          else if (player.isLocal && shootPressed) audio.playEmptyClick();
        }
      }
    }
  }

  _trySwitchWeapon(entity, slotIndex) {
    if (!entity.loadout?.slots || !entity.weapon) return false;
    const slots = entity.loadout.slots;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) return false;
    if (entity.loadout.active === slotIndex) {
      // Re-assert the visual state; this also recovers if rendering was
      // temporarily hidden while a respawn/death transition occurred.
      if (entity.player?.isLocal) {
        this.renderSystem?.weaponViewModel?.setWeaponType?.(entity.weapon.typeId);
      }
      return false;
    }

    const currentIndex = entity.loadout.active;
    if (slots[currentIndex]) copyWeaponState(slots[currentIndex], entity.weapon);

    entity.loadout.active = slotIndex;
    copyWeaponState(entity.weapon, slots[slotIndex]);
    entity.weapon.isReloading = false;
    entity.weapon.reloadStartTime = 0;
    entity.weapon.shotsInBurst = 0;
    entity.weapon.currentSpread = 0;
    entity.weapon.shootHeldPrev = false;

    // Weapon selection is a state change, not a reload. Do not play reload
    // audio here. The viewmodel is updated immediately so the pistol (slot 0)
    // and every other slot become visible on the same simulation tick.
    if (entity.player?.isLocal) {
      this.renderSystem?.weaponViewModel?.setWeaponType?.(entity.weapon.typeId);
    }
    entity.character?.setWeaponType?.(entity.weapon.typeId);
    return true;
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
      this.renderSystem?.weaponViewModel?.onFired?.(0.1 + (weapon.recoilPitch || 0) * 2);
    }

    const pelletCount = Math.max(1, weapon.pelletCount || 1);
    const range = weapon.range || 100;
    const exclude = physics?.colliders || physics?.collider || null;

    const origin = this._getMuzzleWorldPosition(entity);

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
      let hitZone = null;
      let didHit = false;

      if (this.physicsWorld?.castRay) {
        const hit = this.physicsWorld.castRay(origin, dir, range, exclude);
        if (hit) {
          didHit = true;
          endPos = hit.point;
          hitNormal = hit.normal || hitNormal;
          hitEntity = hit.entity === entity ? null : hit.entity;
          hitRenderTarget = hit.renderTarget || null;
          hitZone = hit.hitZone || null;
        }
      }

      createBullet(ecsWorld, this.sceneManager, origin, endPos);

      this._emit({
        type: EVENT_TYPES.SHOT,
        shooterId: player.id,
        weaponId: weapon.typeId ?? 1,
        sfx: weapon.sfx || 'pistol',
        origin,
        end: endPos,
        hit: didHit,
        hitEntityId: hitEntity?.player?.id ?? null,
        hitZone: hitZone || null,
        normal: hitNormal,
        primary: p === 0,
      });

      if (didHit) {
        const isPlayerHit = !!hitEntity?.player;
        createImpactDecal(
          ecsWorld,
          this.sceneManager,
          endPos,
          hitNormal,
          hitRenderTarget
        );
        if (isPlayerHit) {
          createBloodImpact(
            ecsWorld,
            this.sceneManager,
            endPos,
            hitNormal,
            hitRenderTarget
          );
        }
        if (player.isLocal && p === 0) audio.playImpact();
      }

      if (this.isAuthoritative && this.healthSystem && hitEntity?.player && !hitEntity.player.isDead) {
        const baseDamage = weapon.damage || 20;
        const multiplier = hitZone === 'head'
          ? 2.0
          : (hitZone === 'leftArm' || hitZone === 'rightArm' || hitZone === 'leftLeg' || hitZone === 'rightLeg')
            ? 0.65
            : 1.0;
        const dmg = baseDamage * multiplier;

        // HealthSystem owns the lethal transition and kill/death accounting.
        // This is important for multi-pellet weapons: several pellets can hit
        // the same target in one shot, but a death must increment K/D exactly once.
        this.healthSystem.applyDamage(hitEntity, dmg, player.id);
        this._emit({
          type: EVENT_TYPES.SFX,
          sfx: 'hit',
          sourceId: player.id,
          targetId: hitEntity.player.id,
          position: endPos,
        });
        if (player.isLocal && p === 0) audio.playHit();
      }
    }

    const yawKick = (Math.random() * 2 - 1) * (weapon.recoilYawSpread || 0.01);
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
