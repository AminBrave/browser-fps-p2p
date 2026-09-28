// src/ecs/systems/WeaponSystem.js

import {
  INPUT_FLAGS,
  GAME_CONFIG,
  FIRE_MODE,
  COMBAT_CONFIG,
} from '../../config/index.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { createBullet, createBloodImpact } from '../entities/createBullet.js';
import { createImpactSeed } from './ImpactSystem.js';
import { copyWeaponState } from '../components/Weapon.js';
import { getAccuracyState } from '../../utils/AccuracyModel.js';
import { sampleShotDirection } from '../../game/simulation/combat/ShotDirection.js';
import { audio } from '../../audio/AudioManager.js';
import { EVENT_TYPES } from '../../network/PacketTypes.js';
import { CombatResolver } from '../../game/simulation/combat/CombatResolver.js';
import { BallisticsTracer } from '../../game/simulation/combat/BallisticsTracer.js';
import { canReload, completeReload, shouldFire } from '../../game/simulation/combat/WeaponStateModel.js';

export class WeaponSystem {
  constructor(physicsWorld, sceneManager, healthSystem = null, isAuthoritative = false, renderSystem = null, eventSink = null, impactSystem = null) {
    this.physicsWorld = physicsWorld;
    this.sceneManager = sceneManager;
    this.healthSystem = healthSystem;
    this.isAuthoritative = isAuthoritative;
    this.renderSystem = renderSystem;
    this.eventSink = eventSink;
    this.impactSystem = impactSystem;
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
        const shouldReload = canReload(weapon, wantReload, wantShoot);
        if (shouldReload) {
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
        const shouldFireNow = shouldFire({ weapon, wantShoot, shootPressed, now });

        if (shouldFireNow) {
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
      audio.playShoot(weapon.sfx || 'pistol');
      this.renderSystem?.weaponViewModel?.onFired?.(0.1 + (weapon.recoilPitch || 0) * 2);
    }

    const pelletCount = Math.max(1, weapon.pelletCount || 1);
    const range = Math.max(1, Number(weapon.range) || 100);
    const muzzleVelocity = Math.max(1, Number(weapon.muzzleVelocity) || 500);
    const exclude = physics?.colliders || physics?.collider || null;
    const origin = this._getMuzzleWorldPosition(entity);

    for (let p = 0; p < pelletCount; p++) {
      const dir = sampleShotDirection({
        yaw: aimYaw,
        pitch: aimPitch,
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
        direction: dir,
        material: hitEntity?.player
          ? null
          : (hit?.material || this.physicsWorld?.getProjectileMaterial?.(hit) || null),
        impactSeed: hitEntity?.player
          ? null
          : createImpactSeed({
              shooterId: player.id,
              weaponId: weapon.typeId ?? 1,
              position: endPos,
              material: hit?.material || this.physicsWorld?.getProjectileMaterial?.(hit) || 'default',
              sequence: p * 32 + (trace.impacts || []).length * 2 + 7,
            }),
        distance: trace.distance,
        muzzleVelocity,
        ballisticDrop: 0.5 * (Number(GAME_CONFIG.GRAVITY) || -19.62) * Math.pow(trace.distance / muzzleVelocity, 2),
        terminalVelocity: trace.velocity || muzzleVelocity,
        penetrated: trace.penetrated || 0,
        impacts: (trace.impacts || []).map((impact, index) => ({
          point: impact.point,
          exitPoint: impact.exitPoint,
          normal: impact.normal,
          exitNormal: impact.exitNormal,
          material: impact.material,
          velocityBefore: impact.velocityBefore,
          velocityAfter: impact.velocityAfter,
          incomingDirection: dir,
          entrySeed: createImpactSeed({
            shooterId: player.id,
            weaponId: weapon.typeId ?? 1,
            position: impact.point,
            material: impact.material,
            sequence: p * 32 + index * 2,
          }),
          exitSeed: createImpactSeed({
            shooterId: player.id,
            weaponId: weapon.typeId ?? 1,
            position: impact.exitPoint,
            material: impact.material,
            sequence: p * 32 + index * 2 + 1,
          }),
        })),
        primary: p === 0,
      });

      // Surface reactions are presentation-only and use the authoritative
      // trace data. Network peers reconstruct the same reaction from the
      // deterministic seeds carried by SHOT.
      for (const [index, impact] of (trace.impacts || []).entries()) {
        this.impactSystem?.spawnSurfaceImpact({
          position: impact.point,
          normal: impact.normal || hitNormal,
          material: impact.material,
          incomingDirection: dir,
          velocityBefore: impact.velocityBefore,
          velocityAfter: impact.velocityAfter,
          seed: createImpactSeed({
            shooterId: player.id,
            weaponId: weapon.typeId ?? 1,
            position: impact.point,
            material: impact.material,
            sequence: p * 32 + index * 2,
          }),
          penetrated: true,
        });
        if (impact.exitPoint) {
          this.impactSystem?.spawnSurfaceImpact({
            position: impact.exitPoint,
            normal: impact.exitNormal || impact.normal || hitNormal,
            material: impact.material,
            incomingDirection: dir,
            velocityBefore: impact.velocityAfter,
            velocityAfter: impact.velocityAfter,
            seed: createImpactSeed({
              shooterId: player.id,
              weaponId: weapon.typeId ?? 1,
              position: impact.exitPoint,
              material: impact.material,
              sequence: p * 32 + index * 2 + 1,
            }),
            exit: true,
            penetrated: true,
          });
        }
      }

      if (didHit) {
        const isPlayerHit = !!hitEntity?.player;
        if (isPlayerHit) {
          createBloodImpact(
            ecsWorld,
            this.sceneManager,
            endPos,
            hitNormal,
            hitRenderTarget,
            hitEntity
          );
        } else {
          const finalMaterial =
            hit?.material ||
            this.physicsWorld?.getProjectileMaterial?.(hit) ||
            'default';
          this.impactSystem?.spawnSurfaceImpact({
            position: endPos,
            normal: hitNormal,
            material: finalMaterial,
            incomingDirection: dir,
            velocityBefore: trace.velocity || muzzleVelocity,
            velocityAfter: 0,
            targetMesh: hitRenderTarget,
            targetEntity: hitEntity,
            seed: createImpactSeed({
              shooterId: player.id,
              weaponId: weapon.typeId ?? 1,
              position: endPos,
              material: finalMaterial,
              sequence: p * 32 + (trace.impacts || []).length * 2 + 7,
            }),
          });
        }
        if (player.isLocal && p === 0) audio.playImpact();
      }

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
