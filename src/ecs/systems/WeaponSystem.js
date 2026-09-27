// src/ecs/systems/WeaponSystem.js

import {
  INPUT_FLAGS,
  GAME_CONFIG,
  FIRE_MODE,
} from '../../config/index.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { createBullet, createImpactDecal, createBloodImpact } from '../entities/createBullet.js';
import { copyWeaponState } from '../components/Weapon.js';
import { getAccuracyState } from '../../utils/AccuracyModel.js';
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
          this._emit({
            type: EVENT_TYPES.SFX,
            sfx: 'reloadEnd',
            sourceId: player.id,
            position: { ...transform.position },
          });
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
          this._emit({
            type: EVENT_TYPES.SFX,
            sfx: 'reloadStart',
            sourceId: player.id,
            position: { ...transform.position },
          });
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

  /**
   * Trace a projectile through the authoritative physics world while applying
   * constant gravitational acceleration. Each small chord is a real physics
   * ray query, so walls and hitboxes remain the source of truth.
   */
  _traceBallisticShot(origin, direction, muzzleVelocity, range, excludeCollider) {
    const speed = Math.max(1, Number(muzzleVelocity) || 500);
    const maxRange = Math.max(1, Number(range) || 100);
    const gravity = Number(GAME_CONFIG.GRAVITY) || -19.62;

    // Use short trajectory chords for reliable collision detection without
    // turning every rifle shot into hundreds of scene queries.
    const stepDistance = 3.0;
    const steps = Math.max(8, Math.min(64, Math.ceil(maxRange / stepDistance)));
    const flightTime = maxRange / speed;
    const dt = flightTime / steps;

    const path = [{ ...origin }];
    let previous = { ...origin };
    let travelled = 0;

    for (let i = 1; i <= steps; i++) {
      const t = dt * i;
      const next = {
        x: origin.x + direction.x * speed * t,
        y: origin.y + direction.y * speed * t + 0.5 * gravity * t * t,
        z: origin.z + direction.z * speed * t,
      };

      const segment = {
        x: next.x - previous.x,
        y: next.y - previous.y,
        z: next.z - previous.z,
      };
      const segmentLength = Math.hypot(segment.x, segment.y, segment.z);

      if (segmentLength > 1e-6 && this.physicsWorld?.castRay) {
        const segmentDirection = {
          x: segment.x / segmentLength,
          y: segment.y / segmentLength,
          z: segment.z / segmentLength,
        };
        const hit = this.physicsWorld.castRay(
          previous,
          segmentDirection,
          segmentLength,
          excludeCollider
        );

        if (hit) {
          const hitDistance = Math.max(0, Math.min(segmentLength, Number(hit.toi) || 0));
          const hitPoint = {
            x: previous.x + segmentDirection.x * hitDistance,
            y: previous.y + segmentDirection.y * hitDistance,
            z: previous.z + segmentDirection.z * hitDistance,
          };
          path.push(hitPoint);
          return {
            hit,
            point: hitPoint,
            distance: travelled + hitDistance,
            path,
          };
        }
      }

      travelled += segmentLength;
      previous = next;
      path.push(next);
    }

    return {
      hit: null,
      point: previous,
      distance: travelled,
      path,
    };
  }

  _getDamageMultiplier(weapon, distance) {
    const start = Math.max(0, Number(weapon.damageFalloffStart) || 0);
    const end = Math.max(start + 0.001, Number(weapon.damageFalloffEnd) || Number(weapon.range) || 100);
    const minimum = Math.min(1, Math.max(0, Number(weapon.minDamageMultiplier) || 0.5));

    if (distance <= start) return 1;
    if (distance >= end) return minimum;

    const t = (distance - start) / (end - start);
    return 1 + (minimum - 1) * t;
  }

  _getHitZoneMultiplier(hitZone) {
    if (hitZone === 'head') return 2.0;
    if (
      hitZone === 'leftArm' ||
      hitZone === 'rightArm' ||
      hitZone === 'leftLeg' ||
      hitZone === 'rightLeg'
    ) {
      return 0.65;
    }
    return 1.0;
  }

  _fireShot(ecsWorld, entity, now) {
    const player = entity.player;
    const transform = entity.transform;
    const input = entity.input;
    const weapon = entity.weapon;
    const physics = entity.physics;

    const aimYaw = input.yaw || 0;
    const aimPitch = input.pitch || 0;
    const speed = Math.hypot(
      Number(physics?.velocity?.x) || 0,
      Number(physics?.velocity?.z) || 0
    );
    const mask = input.inputMask || 0;
    const stance = input.stance ?? 0;
    const sprinting =
      hasFlag(mask, INPUT_FLAGS.SPRINT) &&
      hasFlag(mask, INPUT_FLAGS.FORWARD) &&
      stance === 0;

    const accuracy = getAccuracyState({
      stance,
      speed,
      maxSpeed: GAME_CONFIG.MAX_SPEED ?? 10.8,
      isAiming: !!input.isAiming,
      isSprinting: sprinting,
      steadySpread: Number(weapon.steadySpread) || 0.003,
      baseSpread: Number(weapon.spreadBase) || 0,
      bloom: Number(weapon.currentSpread) || 0,
      spreadMax: Number(weapon.spreadMax) || 0.05,
      moveSpreadMax: GAME_CONFIG.MOVE_SPREAD_MAX ?? 0.035,
    });
    const effectiveSpread = accuracy.rawSpread;

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
    const range = Math.max(1, Number(weapon.range) || 100);
    const muzzleVelocity = Math.max(1, Number(weapon.muzzleVelocity) || 500);
    const exclude = physics?.colliders || physics?.collider || null;
    const origin = this._getMuzzleWorldPosition(entity);

    for (let p = 0; p < pelletCount; p++) {
      let yawOff = 0;
      let pitchOff = 0;

      if (effectiveSpread > 0) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * effectiveSpread;
        yawOff = Math.cos(angle) * radius;
        pitchOff = Math.sin(angle) * radius;
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
      dir.x /= dLen;
      dir.y /= dLen;
      dir.z /= dLen;

      const trace = this._traceBallisticShot(
        origin,
        dir,
        muzzleVelocity,
        range,
        exclude
      );

      const endPos = trace.point;
      const hit = trace.hit;
      const hitNormal = hit?.normal || {
        x: -dir.x,
        y: -dir.y,
        z: -dir.z,
      };
      const hitEntity = hit?.entity === entity ? null : (hit?.entity || null);
      const hitRenderTarget = hit?.renderTarget || null;
      const hitZone = hit?.hitZone || null;
      const didHit = !!hit;

      createBullet(
        ecsWorld,
        this.sceneManager,
        origin,
        endPos,
        trace.path
      );

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
        distance: trace.distance,
        muzzleVelocity,
        ballisticDrop: 0.5 * (Number(GAME_CONFIG.GRAVITY) || -19.62) * Math.pow(trace.distance / muzzleVelocity, 2),
        primary: p === 0,
      });

      if (didHit) {
        const isPlayerHit = !!hitEntity?.player;
        createImpactDecal(
          ecsWorld,
          this.sceneManager,
          endPos,
          hitNormal,
          hitRenderTarget,
          hitEntity
        );
        if (isPlayerHit) {
          createBloodImpact(
            ecsWorld,
            this.sceneManager,
            endPos,
            hitNormal,
            hitRenderTarget,
            hitEntity
          );
        }
        if (player.isLocal && p === 0) audio.playImpact();
      }

      if (this.isAuthoritative && this.healthSystem && hitEntity?.player && !hitEntity.player.isDead) {
        const baseDamage = Number(weapon.damage) || 20;
        const distanceMultiplier = this._getDamageMultiplier(weapon, trace.distance);
        const hitZoneMultiplier = this._getHitZoneMultiplier(hitZone);
        const dmg = baseDamage * distanceMultiplier * hitZoneMultiplier;

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
