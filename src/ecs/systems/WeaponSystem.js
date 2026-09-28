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
import * as THREE from 'three';

export class WeaponSystem {
  constructor(physicsWorld, sceneManager, healthSystem = null, isAuthoritative = false, renderSystem = null, eventSink = null, impactSystem = null) {
    this.physicsWorld = physicsWorld;
    this.sceneManager = sceneManager;
    this.healthSystem = healthSystem;
    this.isAuthoritative = isAuthoritative;
    this.renderSystem = renderSystem;
    this.eventSink = eventSink;
    this.impactSystem = impactSystem;
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
  _traceBallisticShot(origin, direction, muzzleVelocity, range, excludeCollider, weapon = null) {
    const initialSpeed = Math.max(1, Number(muzzleVelocity) || 500);
    let velocity = {
      x: direction.x * initialSpeed,
      y: direction.y * initialSpeed,
      z: direction.z * initialSpeed,
    };
    const maxRange = Math.max(1, Number(range) || 100);
    const gravity = Number(GAME_CONFIG.GRAVITY) || -19.62;
    const drag = Math.max(0, Number(weapon?.airDrag) || 0.002);
    const penetrationPower = Math.max(0, Number(weapon?.penetrationPower) || 0);
    const maxPenetrations = 3;
    const stepDistance = 2.5;
    const maxSteps = Math.max(16, Math.min(96, Math.ceil(maxRange / stepDistance)));
    const path = [{ ...origin }];
    const impacts = [];
    let position = { ...origin };
    let travelled = 0;
    let elapsed = 0;
    let remainingEnergy = 1;
    let exclude = excludeCollider;
    let excludedPenetrationCollider = null;
    let excludedPenetrationUntil = 0;

    for (let i = 0; i < maxSteps && travelled < maxRange && remainingEnergy > 0.03; i++) {
      const speed = Math.max(1, Math.hypot(velocity.x, velocity.y, velocity.z));
      const step = Math.min(stepDistance, maxRange - travelled);
      const dt = step / speed;
      const dragFactor = Math.exp(-drag * step * Math.max(0.35, speed / initialSpeed));

      const next = {
        x: position.x + velocity.x * dt * dragFactor,
        y: position.y + velocity.y * dt * dragFactor + 0.5 * gravity * dt * dt,
        z: position.z + velocity.z * dt * dragFactor,
      };
      const segment = {
        x: next.x - position.x,
        y: next.y - position.y,
        z: next.z - position.z,
      };
      const segmentLength = Math.hypot(segment.x, segment.y, segment.z);
      if (segmentLength < 1e-6) break;

      const segmentDirection = {
        x: segment.x / segmentLength,
        y: segment.y / segmentLength,
        z: segment.z / segmentLength,
      };
      if (excludedPenetrationCollider && travelled >= excludedPenetrationUntil) {
        excludedPenetrationCollider = null;
      }

      const queryExclude = excludedPenetrationCollider
        ? [exclude, excludedPenetrationCollider]
        : exclude;
      const hit = this.physicsWorld?.castRay
        ? this.physicsWorld.castRay(position, segmentDirection, segmentLength, queryExclude)
        : null;

      if (!hit) {
        travelled += segmentLength;
        elapsed += dt;
        position = next;
        velocity.x *= dragFactor;
        velocity.y = velocity.y * dragFactor + gravity * dt;
        velocity.z *= dragFactor;
        path.push({ ...position });
        continue;
      }

      const hitDistance = Math.max(0, Math.min(segmentLength, Number(hit.toi) || 0));
      const hitPoint = {
        x: position.x + segmentDirection.x * hitDistance,
        y: position.y + segmentDirection.y * hitDistance,
        z: position.z + segmentDirection.z * hitDistance,
      };
      travelled += hitDistance;
      elapsed += dt * (hitDistance / Math.max(segmentLength, 1e-6));
      path.push(hitPoint);

      const hitSpeed = Math.max(1, speed * Math.exp(-drag * hitDistance));
      if (hit.entity?.player) {
        return {
          hit,
          point: hitPoint,
          distance: travelled,
          path,
          impacts,
          velocity: hitSpeed,
          remainingEnergy,
          flightTime: elapsed,
          penetrated: impacts.length,
        };
      }

      const material = hit.material || this.physicsWorld?.getProjectileMaterial?.(hit) || 'default';
      const materials = COMBAT_CONFIG?.MATERIALS || {};
      const materialCfg = materials[material] || materials.default || { resistance: 1, maxThickness: 0.3 };
      const thicknessLimit = Math.max(0.02, Number(materialCfg.maxThickness) || 0.3);
      const resistance = Math.max(0.01, Number(materialCfg.resistance) || 1);

      const exitOrigin = {
        x: hitPoint.x + segmentDirection.x * 0.006,
        y: hitPoint.y + segmentDirection.y * 0.006,
        z: hitPoint.z + segmentDirection.z * 0.006,
      };
      const exitHit = this.physicsWorld?.getProjectileExitHit
        ? this.physicsWorld.getProjectileExitHit(
            hit.collider,
            exitOrigin,
            segmentDirection,
            thicknessLimit + 0.02
          )
        : null;
      const exitDistance = exitHit?.distance ?? null;
      const exitNormal = exitHit?.normal || null;

      // A grazing ray can travel through the surface farther than the
      // material's nominal maximum penetration thickness. If Rapier cannot
      // find the actual opposite surface within that bound, there is no
      // trustworthy exit point. Do not fabricate one at thicknessLimit:
      // doing that creates a second stacked hole near the entry hole.
      if (exitDistance == null) {
        return {
          hit,
          point: hitPoint,
          distance: travelled,
          path,
          impacts,
          velocity: hitSpeed,
          remainingEnergy,
          flightTime: elapsed,
          penetrated: impacts.length,
        };
      }

      const thickness = Math.max(
        0.02,
        Math.min(thicknessLimit, exitDistance)
      );

      const energyCost = (thickness / thicknessLimit) * resistance;
      const penetrationRatio = penetrationPower / Math.max(0.01, energyCost);

      if (penetrationRatio < 1 || impacts.length >= maxPenetrations) {
        return {
          hit,
          point: hitPoint,
          distance: travelled,
          path,
          impacts,
          velocity: hitSpeed,
          remainingEnergy,
          flightTime: elapsed,
          penetrated: impacts.length,
        };
      }

      const energyLoss = Math.min(0.88, energyCost / Math.max(0.01, penetrationPower));
      remainingEnergy *= Math.max(0.05, 1 - energyLoss);
      const exactExitDistance = Math.max(0.02, exitDistance);
      const exitPoint = {
        x: exitOrigin.x + segmentDirection.x * exactExitDistance,
        y: exitOrigin.y + segmentDirection.y * exactExitDistance,
        z: exitOrigin.z + segmentDirection.z * exactExitDistance,
      };
      travelled += exactExitDistance;

      const residualSpeed = hitSpeed * Math.sqrt(Math.max(0.05, remainingEnergy));
      velocity = {
        x: segmentDirection.x * residualSpeed,
        y: segmentDirection.y * residualSpeed,
        z: segmentDirection.z * residualSpeed,
      };
      const outwardNormal = exitNormal || {
        x: -segmentDirection.x,
        y: -segmentDirection.y,
        z: -segmentDirection.z,
      };
      const normalLength = Math.hypot(
        outwardNormal.x,
        outwardNormal.y,
        outwardNormal.z
      ) || 1;
      const normalizedExitNormal = {
        x: outwardNormal.x / normalLength,
        y: outwardNormal.y / normalLength,
        z: outwardNormal.z / normalLength,
      };
      // Move beyond the exit face along its actual outward normal. At a very
      // shallow grazing angle, advancing only along the projectile direction
      // can leave the ray numerically inside the same volume and cause the
      // next segment to generate duplicate entry/exit impacts.
      const exitClearance = 0.018;
      position = {
        x: exitPoint.x + normalizedExitNormal.x * exitClearance + segmentDirection.x * 0.004,
        y: exitPoint.y + normalizedExitNormal.y * exitClearance + segmentDirection.y * 0.004,
        z: exitPoint.z + normalizedExitNormal.z * exitClearance + segmentDirection.z * 0.004,
      };

      const duplicateImpact = impacts.some((impact) => {
        const contactPoints = [impact.point, impact.exitPoint].filter(Boolean);
        return contactPoints.some((point) => {
          const dx = point.x - hitPoint.x;
          const dy = point.y - hitPoint.y;
          const dz = point.z - hitPoint.z;
          return dx * dx + dy * dy + dz * dz < 0.018 * 0.018;
        });
      });
      if (duplicateImpact) {
        position = {
          x: position.x + normalizedExitNormal.x * 0.012,
          y: position.y + normalizedExitNormal.y * 0.012,
          z: position.z + normalizedExitNormal.z * 0.012,
        };
        excludedPenetrationCollider = hit.collider || null;
        excludedPenetrationUntil = travelled + 0.05;
        exclude = null;
        path.push({ ...position });
        continue;
      }

      impacts.push({
        point: { ...hitPoint },
        exitPoint: { ...exitPoint },
        normal: hit.normal,
        exitNormal: exitNormal || {
          x: -segmentDirection.x,
          y: -segmentDirection.y,
          z: -segmentDirection.z,
        },
        material,
        thickness,
        velocityBefore: hitSpeed,
        velocityAfter: residualSpeed,
        energyRemaining: remainingEnergy,
      });
      exclude = null;
      excludedPenetrationCollider = hit.collider || null;
      excludedPenetrationUntil = travelled + 0.05;
      path.push({ ...position });
    }

    return {
      hit: null,
      point: position,
      distance: travelled,
      path,
      impacts,
      velocity: Math.max(0, Math.hypot(velocity.x, velocity.y, velocity.z)),
      remainingEnergy,
      flightTime: elapsed,
      penetrated: impacts.length,
    };
  }

  /**
   * Distance damage is based on the projectile's actual travelled path, not
   * straight-line muzzle-to-target distance. That matters because gravity
   * bends the trajectory and therefore changes flight distance/time.
   *
   * The curve is deliberately configurable per weapon:
   *   1.0 = linear falloff
   *   >1 = retain power longer, then weaken harder near the end
   *   <1 = lose power early
   */
  _getDamageMultiplier(weapon, distance) {
    const start = Math.max(0, Number(weapon.damageFalloffStart) || 0);
    const end = Math.max(
      start + 0.001,
      Number(weapon.damageFalloffEnd) || Number(weapon.range) || 100
    );
    const minimum = Math.min(1, Math.max(0, Number(weapon.minDamageMultiplier) || 0.5));
    const curve = Math.max(0.25, Number(weapon.damageFalloffCurve) || 1);

    if (distance <= start) return 1;
    if (distance >= end) return minimum;

    const normalized = Math.min(1, Math.max(0, (distance - start) / (end - start)));
    const shaped = Math.pow(normalized, curve);
    return 1 + (minimum - 1) * shaped;
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
      const dir = sampleShotDirection({
        yaw: aimYaw,
        pitch: aimPitch,
        spread: effectiveSpread,
      });

      const trace = this._traceBallisticShot(
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
        const baseDamage = Number(weapon.damage) || 20;
        const distanceMultiplier = this._getDamageMultiplier(weapon, trace.distance);
        const hitZoneMultiplier = this._getHitZoneMultiplier(hitZone);
        // Kinetic energy scales with v². This makes air drag and
        // penetration physically coherent with damage: a slower projectile
        // carries less terminal energy, regardless of how it became slower.
        const velocityRatio = THREE.MathUtils.clamp(
          (Number(trace.velocity) || 0) / muzzleVelocity,
          0,
          1
        );
        const kineticEnergyMultiplier = Math.max(0.05, velocityRatio * velocityRatio);
        const legacyPenetrationPenalty = Math.max(
          0.1,
          1 - (Number(weapon.penetrationDamageLoss) || 0) * (trace.penetrated || 0)
        );
        const dmg = baseDamage *
          distanceMultiplier *
          hitZoneMultiplier *
          kineticEnergyMultiplier *
          legacyPenetrationPenalty;

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
