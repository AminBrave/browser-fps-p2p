// src/ecs/systems/WeaponSystem.js

import {
  INPUT_FLAGS,
  GAME_CONFIG,
} from '../../config/index.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { buildShotEvent } from '../../game/simulation/combat/ShotEventModel.js';
import { copyWeaponState } from '../components/Weapon.js';
import { getAccuracyState } from '../../utils/AccuracyModel.js';
import { sampleDirectionAroundVector } from '../../game/simulation/combat/ShotDirection.js';
import { EVENT_TYPES } from '../../network/PacketTypes.js';
import { CombatResolver } from '../../game/simulation/combat/CombatResolver.js';
import { BallisticsTracer } from '../../game/simulation/combat/BallisticsTracer.js';
import { canReload, completeReload, shouldFire } from '../../game/simulation/combat/WeaponStateModel.js';

export class WeaponSystem {
  constructor({ physicsWorld, healthSystem = null, isAuthoritative = false, eventSink = null } = {}) {
    this.physicsWorld = physicsWorld;
    this.healthSystem = healthSystem;
    this.isAuthoritative = isAuthoritative;
    this.eventSink = eventSink;
    this.presentationEvents = [];
    this.combatResolver = new CombatResolver();
    this.ballisticsTracer = new BallisticsTracer({
      castRay: (...args) => this.physicsWorld?.castRay?.(...args) || null,
      getProjectileMaterial: (...args) => this.physicsWorld?.getProjectileMaterial?.(...args) || 'default',
      getProjectileExitHit: (...args) => this.physicsWorld?.getProjectileExitHit?.(...args) || null,
    });
  }

  setEventSink(eventSink) {
    this.eventSink = eventSink;
  }

  _emit(event) {
    this.eventSink?.(event);
  }

  _emitPresentation(event) {
    this.presentationEvents.push(Object.freeze(event));
  }

  drainPresentationEvents() {
    if (!this.presentationEvents.length) return [];
    const events = this.presentationEvents;
    this.presentationEvents = [];
    return events;
  }

  _getEyeWorldPosition(entity) {
    const transform = entity.transform;
    const input = entity.input;
    const stance = input?.stance ?? 0;
    const eyeOffset = stance === 2 ? 0.10 : stance === 1 ? 0.45 : 0.73;
    return {
      x: Number(transform?.position?.x) || 0,
      y: (Number(transform?.position?.y) || 0) + eyeOffset,
      z: Number(transform?.position?.z) || 0,
    };
  }

  _getMuzzleWorldPosition(entity) {
    const eye = this._getEyeWorldPosition(entity);
    const input = entity.input;
    const yaw = Number(input?.yaw ?? entity.transform?.rotation?.yaw ?? 0);
    const pitch = Number(input?.pitch) || 0;
    const weaponId = Number(entity.weapon?.typeId) || 1;

    // Keep the simulation muzzle in the same camera-local transform as the
    // rendered WeaponViewModel. In particular, ADS changes the weapon root
    // position/rotation/scale; using the old fixed muzzle offset here makes
    // the shot originate from the hip-fire muzzle while the visible gun has
    // already moved into the sight position.
    const aimPose = input?.isAiming
      ? ({
          1: { x: 0.03, y: -0.18, z: -0.58, pitch: 0.02, yaw: 0.02, roll: 0 },
          2: { x: 0.025, y: -0.17, z: -0.60, pitch: 0.015, yaw: 0.018, roll: 0 },
          3: { x: 0.02, y: -0.16, z: -0.62, pitch: 0.01, yaw: 0.015, roll: 0 },
          4: { x: 0.018, y: -0.17, z: -0.61, pitch: 0.012, yaw: 0.012, roll: 0 },
        }[weaponId] || { x: 0.03, y: -0.18, z: -0.58, pitch: 0.02, yaw: 0.02, roll: 0 })
      : { x: 0.22, y: -0.22, z: -0.48, pitch: 0.1, yaw: 0.18, roll: 0.06 };

    const weaponModelScale =
      weaponId === 1 ? 1.35 :
      weaponId === 2 ? 1.25 :
      weaponId === 3 ? 1.2 :
      1.2;
    const weaponRootScale = input?.isAiming ? 0.92 : 1;

    // muzzleLocal values from WeaponViewModel, expressed in the individual
    // weapon model's local space.
    const muzzleLocal = {
      1: { x: 0, y: 0.05, z: -0.32 },
      2: { x: 0, y: 0.04, z: -0.50 },
      3: { x: 0, y: 0.04, z: -0.50 },
      4: { x: 0, y: 0.05, z: -0.62 },
    }[weaponId] || { x: 0, y: 0.05, z: -0.32 };

    let lx = muzzleLocal.x * weaponModelScale * weaponRootScale;
    let ly = muzzleLocal.y * weaponModelScale * weaponRootScale;
    let lz = muzzleLocal.z * weaponModelScale * weaponRootScale;

    // Apply the same root Euler rotation order used by Three.js (XYZ).
    const sx = Math.sin(aimPose.pitch), cx = Math.cos(aimPose.pitch);
    const sy = Math.sin(aimPose.yaw), cy = Math.cos(aimPose.yaw);
    const sz = Math.sin(aimPose.roll), cz = Math.cos(aimPose.roll);

    // Rx
    let y1 = ly * cx - lz * sx;
    let z1 = ly * sx + lz * cx;
    let x1 = lx;
    // Ry
    let x2 = x1 * cy + z1 * sy;
    let z2 = -x1 * sy + z1 * cy;
    let y2 = y1;
    // Rz
    const x3 = x2 * cz - y2 * sz;
    const y3 = x2 * sz + y2 * cz;
    const z3 = z2;

    const cameraLocal = {
      x: aimPose.x + x3,
      y: aimPose.y + y3,
      z: aimPose.z + z3,
    };

    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cameraForward = {
      x: -Math.sin(yaw) * cosPitch,
      y: sinPitch,
      z: -Math.cos(yaw) * cosPitch,
    };
    const cameraRight = {
      x: Math.cos(yaw),
      y: 0,
      z: -Math.sin(yaw),
    };
    const cameraUp = {
      x: cameraRight.y * cameraForward.z - cameraRight.z * cameraForward.y,
      y: cameraRight.z * cameraForward.x - cameraRight.x * cameraForward.z,
      z: cameraRight.x * cameraForward.y - cameraRight.y * cameraForward.x,
    };

    return {
      x: eye.x + cameraRight.x * cameraLocal.x + cameraUp.x * cameraLocal.y + cameraForward.x * (-cameraLocal.z),
      y: eye.y + cameraRight.y * cameraLocal.x + cameraUp.y * cameraLocal.y + cameraForward.y * (-cameraLocal.z),
      z: eye.z + cameraRight.z * cameraLocal.x + cameraUp.z * cameraLocal.y + cameraForward.z * (-cameraLocal.z),
    };
  }

  _getCrosshairAimPoint(entity, maxRange, exclude) {
    const eye = this._getEyeWorldPosition(entity);
    const input = entity.input;
    const yaw = Number(input?.yaw) || 0;
    const pitch = Number(input?.pitch) || 0;
    const cosPitch = Math.cos(pitch);
    const direction = {
      x: -Math.sin(yaw) * cosPitch,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cosPitch,
    };

    const hit = this.physicsWorld?.castRay?.(
      eye,
      direction,
      maxRange,
      exclude
    );

    if (hit) {
      const distance = Math.max(0, Math.min(maxRange, Number(hit.toi) || 0));
      return {
        x: eye.x + direction.x * distance,
        y: eye.y + direction.y * distance,
        z: eye.z + direction.z * distance,
      };
    }

    return {
      x: eye.x + direction.x * maxRange,
      y: eye.y + direction.y * maxRange,
      z: eye.z + direction.z * maxRange,
    };
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
          if (player.isLocal) this._emitPresentation({ type: 'reloadEnd' });
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
        const shouldReload = canReload(weapon, wantReload, wantShoot);
        if (shouldReload) {
          weapon.isReloading = true;
          weapon.reloadStartTime = now;
          weapon.justStartedReload = true;
          if (player.isLocal) this._emitPresentation({ type: 'reloadStart' });
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
        const shouldFireNow = shouldFire({ weapon, wantShoot, shootPressed, now });

        if (shouldFireNow) {
          if (mag > 0) this._fireShot(ecsWorld, entity, now);
          else if (player.isLocal && shootPressed) this._emitPresentation({ type: 'emptyClick' });
        }
      }
    }
  }

  _trySwitchWeapon(entity, slotIndex) {
    if (!entity.loadout?.slots || !entity.weapon) return false;
    const slots = entity.loadout.slots;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) return false;
    if (entity.loadout.active === slotIndex) {
      if (entity.player?.isLocal) this._emitPresentation({ type: 'weaponType', typeId: entity.weapon.typeId });
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

    if (entity.player?.isLocal) this._emitPresentation({ type: 'weaponType', typeId: entity.weapon.typeId });
    return true;
  }

  _completeReload(weapon) {
    const result = completeReload(weapon);
    if (!result) return false;
    weapon.magazine = result.magazine;
    weapon.reserveAmmo = result.reserveAmmo;
    weapon.ammo = result.magazine;
    weapon.currentAmmo = result.magazine;
    weapon.maxAmmo = weapon.magazineSize || 12;
    weapon.isReloading = false;
    return true;
  }

  /**
   * Trace a projectile through the authoritative physics world while applying
   * constant gravitational acceleration. Each small chord is a real physics
   * ray query, so walls and hitboxes remain the source of truth.
   */


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
      this._emitPresentation({
        type: 'weaponFired',
        recoil: 0.1 + (weapon.recoilPitch || 0) * 2,
        sfx: weapon.sfx || 'pistol',
      });
    }

    const pelletCount = Math.max(1, weapon.pelletCount || 1);
    const range = Math.max(1, Number(weapon.range) || 100);
    const muzzleVelocity = Math.max(1, Number(weapon.muzzleVelocity) || 500);
    const exclude = physics?.colliders || physics?.collider || null;
    const origin = this._getMuzzleWorldPosition(entity);

    for (let p = 0; p < pelletCount; p++) {
      // Resolve the crosshair against the world first, then launch from the
      // actual muzzle toward that point. This removes the classic FPS muzzle
      // parallax bug where the projectile path is parallel to, but offset from,
      // the crosshair ray.
      const aimPoint = this._getCrosshairAimPoint(entity, range, exclude);
      const muzzleToAim = {
        x: aimPoint.x - origin.x,
        y: aimPoint.y - origin.y,
        z: aimPoint.z - origin.z,
      };
      const muzzleDistance = Math.hypot(muzzleToAim.x, muzzleToAim.y, muzzleToAim.z) || 1;
      const baseDirection = {
        x: muzzleToAim.x / muzzleDistance,
        y: muzzleToAim.y / muzzleDistance,
        z: muzzleToAim.z / muzzleDistance,
      };
      const dir = sampleDirectionAroundVector({
        direction: baseDirection,
        spread: effectiveSpread,
      });

      const trace = this.ballisticsTracer.trace(
        origin,
        dir,
        muzzleVelocity,
        range,
        exclude,
        weapon
      );

      const endPos = trace.point;
      const hit = trace.hit;
      const hitNormal = hit?.normal || {
        x: -dir.x,
        y: -dir.y,
        z: -dir.z,
      };
      const hitEntity = hit?.entity === entity ? null : (hit?.entity || null);
      const hitZone = hit?.hitZone || null;
      const shotEvent = buildShotEvent({
        shooterId: player.id, weapon, origin, end: endPos, hit,
        hitEntityId: hitEntity?.player?.id ?? null, hitZone, normal: hitNormal,
        direction: dir, trace, pelletIndex: p,
      });
      this._emit(shotEvent);
      this._emitPresentation({
        type: 'shot',
        shot: shotEvent,
        hitColliderHandle: hit?.collider?.handle ?? null,
      });

      if (this.isAuthoritative && this.healthSystem && hitEntity?.player && !hitEntity.player.isDead) {
        // Kinetic energy scales with v². The pure simulation model keeps
        // damage independent from Three.js and presentation concerns.
        const damageEvent = this.combatResolver.resolvePlayerHit({
          attackerId: player.id,
          targetEntity: hitEntity,
          weapon,
          distance: trace.distance,
          hitZone,
          terminalVelocity: trace.velocity,
          muzzleVelocity,
          penetrated: trace.penetrated || 0,
        });

        if (damageEvent) {
          this.healthSystem.applyDamage(
            damageEvent.targetEntity,
            damageEvent.amount,
            damageEvent.attackerId
          );
        }
        this._emit({
          type: EVENT_TYPES.SFX,
          sfx: 'hit',
          sourceId: player.id,
          targetId: hitEntity.player.id,
          position: endPos,
        });
        if (player.isLocal && p === 0) this._emitPresentation({ type: 'hit' });
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
