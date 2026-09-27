// src/ecs/systems/RenderSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, PLAYER_CONFIG, CAMERA_CONFIG, RENDER_CONFIG, INPUT_FLAGS, STANCE, getPlayerEyeOffset } from '../../config/index.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { WeaponViewModel } from '../../render/WeaponViewModel.js';
import { moveIntensity } from '../../utils/Movement.js';
import { audio } from '../../audio/AudioManager.js';
import { EVENT_TYPES } from '../../network/PacketTypes.js';

export class RenderSystem {
  constructor(sceneOrManager, camera = null) {
    if (sceneOrManager?.scene) {
      this.sceneManager = sceneOrManager;
      this.scene = sceneOrManager.scene;
      this.camera = sceneOrManager.camera || camera;
    } else {
      this.sceneManager = null;
      this.scene = sceneOrManager;
      this.camera = camera;
    }

    this.weaponViewModel = null;
    this.eventSink = null;
    if (this.camera) {
      if (this.scene && !this.camera.parent) this.scene.add(this.camera);
      this.weaponViewModel = new WeaponViewModel(
        this.camera,
        this.sceneManager?.weaponScene || null
      );
    }

    this._lastTime = performance.now();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._wasGrounded = true;
    this._audioUnlocked = false;
    this._lastWeaponId = null;
    this._renderPosition = null;
    this._previousPosition = null;
    this._currentPosition = null;
    this._networkVisualCorrection = { x: 0, y: 0, z: 0 };
    this._cameraShake = {
      phase: 0,
      intensity: 0,
      landing: 0,
      lastVerticalVelocity: 0,
      lastSpeed: 0,
      runX: 0,
      runY: 0,
    };
    this._aimFov = CAMERA_CONFIG.FOV;
  }

  setEventSink(eventSink) {
    this.eventSink = eventSink;
  }

  resetNetworkVisualCorrection() {
    this._networkVisualCorrection.x = 0;
    this._networkVisualCorrection.y = 0;
    this._networkVisualCorrection.z = 0;
  }

  /**
   * Reconciliation changes the simulation timeline discontinuously. Reset the
   * render history at that exact boundary so the renderer never interpolates
   * between a pre-correction position and a post-correction position.
   */
  snapFixedStateToPhysics(localEntity) {
    const position = localEntity?.physics?.rigidBody?.translation?.();
    if (!position) return;
    this._previousPosition = { ...position };
    this._currentPosition = { ...position };
    this._renderPosition = { ...position };
    this.resetNetworkVisualCorrection();
    if (localEntity) localEntity.networkVisualCorrection = { x: 0, y: 0, z: 0 };
  }

  captureFixedState(localEntity) {
    const position = localEntity?.physics?.rigidBody?.translation?.();
    if (!position) return;
    if (!this._currentPosition) {
      this._previousPosition = { ...position };
      this._currentPosition = { ...position };
      return;
    }
    this._previousPosition = this._currentPosition;
    this._currentPosition = { ...position };
  }

  update(ecsWorld, localEntityArg, _maybeTime, currentTimeArg, renderAlpha = 0) {
    const now =
      typeof currentTimeArg === 'number'
        ? currentTimeArg
        : typeof _maybeTime === 'number'
          ? _maybeTime
          : performance.now();

    const dt = Math.min(RENDER_CONFIG.MAX_RENDER_DELTA_SECONDS, (now - this._lastTime) / 1000);
    this._lastTime = now;

    let localEntity = localEntityArg?.transform ? localEntityArg : null;

    for (const entity of ecsWorld.with('transform', 'renderMesh')) {
      const transform = entity.transform;
      const renderMesh = entity.renderMesh;
      const lifespan = entity.lifespan;

      if (entity.isPermanentDecal && renderMesh?.mesh) {
        if (entity.impactSparkUntil) {
          const started = Number(entity.impactSparkStartedAt) || now;
          const duration = Math.max(1, Number(RENDER_CONFIG.IMPACT_FLASH.SPARK_MS) || 360);
          const elapsed = Math.max(0, (now - started) / 1000);
          const t = THREE.MathUtils.clamp((elapsed * 1000) / duration, 0, 1);
          const sparkGroup = renderMesh.mesh.getObjectByName?.('impactSpark');
          if (sparkGroup) {
            sparkGroup.children.forEach((spark) => {
              const age = elapsed + (Number(spark.userData?.age) || 0);
              if (age <= 0) { spark.visible = false; return; }
              spark.visible = true;
              const v = spark.userData?.velocity;
              if (v) {
                const drag = Math.max(0, Number(spark.userData.drag) || 0);
                const f = Math.exp(-drag * dt);
                v.x *= f; v.y *= f; v.z *= f;
                v.y -= (Number(spark.userData.gravity) || 0) * dt;
                spark.position.x += v.x * dt * RENDER_CONFIG.IMPACT_FLASH.SPARK_SPEED;
                spark.position.y += v.y * dt * RENDER_CONFIG.IMPACT_FLASH.SPARK_SPEED;
                spark.position.z += v.z * dt * RENDER_CONFIG.IMPACT_FLASH.SPARK_SPEED;
              }
              const av = spark.userData?.angularVelocity;
              if (av) {
                spark.rotation.x += av.x * dt; spark.rotation.y += av.y * dt; spark.rotation.z += av.z * dt;
                av.x *= 0.94; av.y *= 0.94; av.z *= 0.94;
              }
              const fadeDelay = Math.max(0, RENDER_CONFIG.IMPACT_FLASH.FADE_DELAY_MS) / 1000;
              const lifeT = THREE.MathUtils.clamp(
                (age - fadeDelay) / Math.max(0.001, duration / 1000 - fadeDelay), 0, 1
              );
              if (spark.material) spark.material.opacity = 1 - Math.pow(lifeT, RENDER_CONFIG.IMPACT_FLASH.FADE_POWER);
              const s = (Number(spark.userData?.baseScale) || 1) * (1 + lifeT * 0.35);
              spark.scale.set(s, s, Math.max(0.08, 1 - lifeT * 0.8));
            });
          }
          if (t >= 1) {
            entity.impactSparkUntil = 0;
            if (sparkGroup) sparkGroup.visible = false;
          }
        }
        if (entity.impactFlashUntil && now < entity.impactFlashUntil) {
          const t = 1 - (entity.impactFlashUntil - now) / RENDER_CONFIG.IMPACT_FLASH.BULLET_MS;
          renderMesh.mesh.traverse((c) => {
            if (c.name === 'impactFlash' && c.material) {
              c.material.opacity = Math.max(0, 1 - t);
            }
          });
        } else if (entity.impactFlashUntil) {
          renderMesh.mesh.traverse((c) => {
            if (c.name === 'impactFlash') c.visible = false;
          });
          entity.impactFlashUntil = 0;
        }
        continue;
      }

      if (lifespan) {
        const elapsed = now - lifespan.createdAt;
        if (elapsed >= lifespan.durationMs) {
          if (renderMesh?.mesh) {
            this.scene?.remove(renderMesh.mesh);
            renderMesh.mesh.traverse?.((c) => {
              c.geometry?.dispose();
              if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
                else c.material.dispose();
              }
            });
            renderMesh.mesh.geometry?.dispose();
            renderMesh.mesh.material?.dispose?.();
          }
          ecsWorld.remove(entity);
          continue;
        }
        if (entity.isBullet && renderMesh?.mesh?.material) {
          renderMesh.mesh.material.opacity = 1 - elapsed / lifespan.durationMs;
        }
      }

      if (!transform || !renderMesh?.mesh) continue;
      if (entity.isMap && !entity.isBoundary) {
        // World objects are owned by the ECS render transform. Keep their
        // visible state deterministic so physics cannot remain active while
        // the corresponding visual root is accidentally hidden.
        renderMesh.mesh.visible = true;
      }
      if (entity.player?.isLocal) {
        renderMesh.mesh.visible = false;
        continue;
      }
      if (entity.isBullet || entity.isImpact) continue;

      renderMesh.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z
      );
      const yaw = transform.rotation?.yaw ?? transform.rotation?.y ?? 0;
      if (renderMesh.mesh.rotation) renderMesh.mesh.rotation.y = yaw;

      if (entity.player && !entity.player.isLocal && entity.character) {
        entity.character.updateVisuals({
          stance: entity.input?.stance ?? entity.player.remoteStance ?? STANCE.STAND,
          pitch: entity.input?.pitch ?? entity.player.remotePitch ?? 0,
          health: entity.player.health ?? GAME_CONFIG.MAX_HEALTH,
          maxHealth: entity.player.maxHealth ?? RENDER_CONFIG.HEALTH_BAR.MAX_HEALTH_FALLBACK,
          isDead: !!entity.player.isDead,
        });
        entity.character.setWeaponType?.(
          entity.player.remoteWeaponId ?? entity.weapon?.typeId ?? 1
        );
        const healthBar = entity.character.parts.healthBar;
        if (healthBar && this.camera) {
          const cameraWorldQuaternion = new THREE.Quaternion();
          const parentWorldQuaternion = new THREE.Quaternion();
          this.camera.getWorldQuaternion(cameraWorldQuaternion);
          renderMesh.mesh.getWorldQuaternion(parentWorldQuaternion);
          parentWorldQuaternion.invert();
          healthBar.quaternion.copy(parentWorldQuaternion).multiply(cameraWorldQuaternion);
        }
      }
    }

    if (!localEntity) {
      for (const entity of ecsWorld.with('player', 'transform', 'input')) {
        if (entity.player?.isLocal) {
          localEntity = entity;
          break;
        }
      }
    }

    if (localEntity?.transform && localEntity?.input && this.camera) {
      const transform = localEntity.transform;
      const input = localEntity.input;
      const weapon = localEntity.weapon;
      const physics = localEntity.physics;

      const stance = input.stance ?? STANCE.STAND;

      // Rapier is authoritative for local simulation. ECS transform remains
      // the gameplay state; render interpolation/correction is visual-only and
      // is never written back into ECS.
      const bodyPosition = physics?.rigidBody?.translation?.();
      if (bodyPosition) {
        // Render interpolation is visual-only. Never write the interpolated
        // camera position back into ECS because gameplay/reconciliation must
        // always read the authoritative predicted physics body.
        if (!this._currentPosition) this.captureFixedState(localEntity);
        const previous = this._previousPosition || bodyPosition;
        const current = this._currentPosition || bodyPosition;
        const alpha = THREE.MathUtils.clamp(Number(renderAlpha) || 0, 0, 1);

        const targetCorrection = localEntity.networkVisualCorrection || { x: 0, y: 0, z: 0 };
        const smoothing = 1 - Math.exp(-RENDER_CONFIG.NETWORK_VISUAL_CORRECTION_SMOOTHING * dt);
        this._networkVisualCorrection.x = THREE.MathUtils.lerp(
          this._networkVisualCorrection.x, targetCorrection.x, smoothing
        );
        this._networkVisualCorrection.y = THREE.MathUtils.lerp(
          this._networkVisualCorrection.y, targetCorrection.y, smoothing
        );
        this._networkVisualCorrection.z = THREE.MathUtils.lerp(
          this._networkVisualCorrection.z, targetCorrection.z, smoothing
        );
        targetCorrection.x *= Math.max(0, 1 - smoothing);
        targetCorrection.y *= Math.max(0, 1 - smoothing);
        targetCorrection.z *= Math.max(0, 1 - smoothing);

        this._renderPosition = {
          x: THREE.MathUtils.lerp(previous.x, current.x, alpha) + this._networkVisualCorrection.x,
          y: THREE.MathUtils.lerp(previous.y, current.y, alpha) + this._networkVisualCorrection.y,
          z: THREE.MathUtils.lerp(previous.z, current.z, alpha) + this._networkVisualCorrection.z,
        };
      }

      // Keep the first-person eye anchored to the exact same head/pose
      // geometry used by the local player's character model. The physics
      // transform is the capsule centre, not the player's feet or head.
      localEntity.character?.updateVisuals?.({
        stance,
        pitch: input.pitch ?? 0,
        health: localEntity.player?.health ?? GAME_CONFIG.MAX_HEALTH,
        maxHealth: localEntity.player?.maxHealth ?? PLAYER_CONFIG.MAX_HEALTH,
        isDead: !!localEntity.player?.isDead,
      });

      const eyeOffset = getPlayerEyeOffset(stance);

      const cameraBase = this._renderPosition || transform.position;

      // Comfort-first first-person movement: low-frequency sinusoidal bob,
      // tiny amplitudes, and slow response. It is render-only, so physics
      // corrections can never become high-frequency camera impulses.
      const velocity = physics?.velocity || { x: 0, y: 0, z: 0 };
      const horizontalSpeed = Math.hypot(Number(velocity.x) || 0, Number(velocity.z) || 0);
      const movementConfig = CAMERA_CONFIG.MOVEMENT;
      const bobConfig = CAMERA_CONFIG.BOB;
      const landingConfig = CAMERA_CONFIG.LANDING;
      const maxRunSpeed = Math.max(1, PLAYER_CONFIG.SPEED);
      const moveAmount = THREE.MathUtils.clamp(
        horizontalSpeed / maxRunSpeed,
        0,
        movementConfig.MAX_SPEED_FACTOR
      );
      const grounded = physics?.isGrounded !== false;
      const targetShake = grounded
        ? THREE.MathUtils.smoothstep(
            moveAmount,
            movementConfig.ACTIVATION_START,
            movementConfig.ACTIVATION_END
          )
        : 0;
      const blend = 1 - Math.exp(-movementConfig.INTENSITY_SMOOTHING * Math.max(0, dt));
      this._cameraShake.intensity = THREE.MathUtils.lerp(
        this._cameraShake.intensity,
        targetShake,
        blend
      );

      const previousY = this._cameraShake.lastVerticalVelocity;
      const verticalVelocity = Number(velocity.y) || 0;
      if (
        !this._wasGrounded &&
        grounded &&
        previousY < landingConfig.DETECT_FALL_SPEED &&
        verticalVelocity >= landingConfig.DETECT_LANDING_SPEED
      ) {
        this._cameraShake.landing = Math.min(
          landingConfig.MAX_INTENSITY,
          -previousY * 0.01
        );
      }
      this._cameraShake.lastVerticalVelocity = verticalVelocity;
      this._cameraShake.landing = Math.max(
        0,
        this._cameraShake.landing -
          Math.max(0, dt) * landingConfig.DECAY_PER_SECOND
      );

      const speedRatio = Math.min(1, moveAmount);
      const stanceMotion =
        stance === STANCE.PRONE ? CAMERA_CONFIG.STANCE_MOTION.PRONE :
        stance === STANCE.CROUCH ? CAMERA_CONFIG.STANCE_MOTION.CROUCH :
        CAMERA_CONFIG.STANCE_MOTION.STAND;
      const frequency =
        (movementConfig.PHASE_SPEED_MIN_HZ +
        (movementConfig.PHASE_SPEED_MAX_HZ - movementConfig.PHASE_SPEED_MIN_HZ) * speedRatio) *
        stanceMotion.frequency;
      this._cameraShake.phase += Math.max(0, dt) * Math.PI * 2 * frequency;
      if (this._cameraShake.phase > Math.PI * 2) {
        this._cameraShake.phase %= Math.PI * 2;
      }

      const gait = this._cameraShake.phase;
      const amount = this._cameraShake.intensity;
      const landing = this._cameraShake.landing;
      const acceleration = (horizontalSpeed - this._cameraShake.lastSpeed) / Math.max(0.001, dt);
      this._cameraShake.lastSpeed = horizontalSpeed;
      const accelerationImpulse = THREE.MathUtils.clamp(
        acceleration * movementConfig.TRANSLATION_PER_ACCELERATION,
        -movementConfig.MAX_ACCELERATION_OFFSET,
        movementConfig.MAX_ACCELERATION_OFFSET
      );

      // Use a blended gait instead of a single sine wave. The fundamental
      // step rhythm gives the player a readable running cadence, while the
      // phase-shifted harmonics add natural asymmetry without introducing
      // high-frequency camera noise that can cause discomfort.
      const step = Math.sin(gait);
      const doubleStep = Math.sin(gait * 2 + 0.35);
      const sideStep = Math.sin(gait + Math.PI * 0.5);
      const runScale = amount * speedRatio;
      const smoothRun = 1 - Math.exp(-movementConfig.MOTION_SMOOTHING * Math.max(0, dt));

      const targetRunX =
        (sideStep * 0.72 + doubleStep * 0.28) *
        movementConfig.RUNNING_SWAY_METERS *
        runScale *
        stanceMotion.horizontal;

      const targetRunY =
        (((Math.abs(step) * 2) - 1) * 0.55 + doubleStep * 0.45) *
        movementConfig.RUNNING_LIFT_METERS *
        runScale *
        stanceMotion.vertical;

      this._cameraShake.runX = THREE.MathUtils.lerp(this._cameraShake.runX || 0, targetRunX, smoothRun);
      this._cameraShake.runY = THREE.MathUtils.lerp(this._cameraShake.runY || 0, targetRunY, smoothRun);

      const bobY =
        this._cameraShake.runY +
        Math.sin(gait * 2) * bobConfig.VERTICAL_METERS * amount * stanceMotion.vertical -
        landing * landingConfig.VERTICAL_METERS;

      const bobX =
        this._cameraShake.runX +
        Math.cos(gait) * bobConfig.HORIZONTAL_METERS * amount * stanceMotion.horizontal -
        accelerationImpulse;

      const bobPitch =
        (step * 0.62 + doubleStep * 0.38) *
        movementConfig.RUNNING_PITCH_RADIANS *
        runScale *
        stanceMotion.pitch +
        Math.sin(gait * 2) * bobConfig.PITCH_RADIANS * amount * stanceMotion.pitch +
        accelerationImpulse * movementConfig.ROTATION_PER_ACCELERATION +
        landing * landingConfig.PITCH_RADIANS;

      const bobYaw =
        (sideStep * 0.72 + doubleStep * 0.28) *
        movementConfig.RUNNING_YAW_RADIANS *
        runScale *
        stanceMotion.yaw +
        Math.cos(gait) * bobConfig.YAW_RADIANS * amount * stanceMotion.yaw;

      const bobRoll =
        (sideStep * 0.65 - step * 0.35) *
        movementConfig.RUNNING_ROLL_RADIANS *
        runScale *
        stanceMotion.roll +
        Math.sin(gait) * bobConfig.ROLL_RADIANS * amount * stanceMotion.roll -
        landing * landingConfig.ROLL_RADIANS;

      this.camera.position.set(
        cameraBase.x + bobX,
        cameraBase.y + eyeOffset + bobY,
        cameraBase.z
      );

      if (weapon) {
        const recovery = (CAMERA_CONFIG.RECOIL_RECOVERY_MULTIPLIER * GAME_CONFIG.RECOIL_RECOVERY) * dt;
        if (weapon.cameraRecoilPitch) {
          const d = Math.min(Math.abs(weapon.cameraRecoilPitch), recovery);
          weapon.cameraRecoilPitch -=
            Math.sign(weapon.cameraRecoilPitch || 1) * d;
        }
        if (weapon.cameraRecoilYaw) {
          const d = Math.min(Math.abs(weapon.cameraRecoilYaw), recovery);
          weapon.cameraRecoilYaw -=
            Math.sign(weapon.cameraRecoilYaw || 1) * d;
        }

        if (weapon.typeId !== this._lastWeaponId) {
          this.weaponViewModel?.setWeaponType?.(weapon.typeId);
          this._lastWeaponId = weapon.typeId;
        }
      }

      const pitch =
        (input.pitch || 0) + (weapon?.cameraRecoilPitch || 0) * CAMERA_CONFIG.RECOIL_SENSITIVITY + bobPitch;

      const aiming = !!input.isAiming && !localEntity.player?.isDead;
      const fovBlend = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.01, RENDER_CONFIG.AIM.TRANSITION_SECONDS));
      this._aimFov = THREE.MathUtils.lerp(
        this._aimFov,
        aiming ? RENDER_CONFIG.AIM.FOV : CAMERA_CONFIG.FOV,
        fovBlend
      );
      if (typeof this.camera.fov === 'number') {
        if (Math.abs(this.camera.fov - this._aimFov) > 0.01) {
          this.camera.fov = this._aimFov;
          this.camera.updateProjectionMatrix();
        }
      }
      const yaw =
        (input.yaw || 0) + (weapon?.cameraRecoilYaw || 0) * CAMERA_CONFIG.RECOIL_SENSITIVITY + bobYaw;

      this._euler.set(pitch, yaw, bobRoll, 'YXZ');
      this.camera.quaternion.setFromEuler(this._euler);
      audio.setListener?.(this.camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion));

      if (this.weaponViewModel) {
        const isDead = !!localEntity.player?.isDead;
        this.weaponViewModel.setVisible(!isDead);

        const mask = input.inputMask || 0;
        const isMoving =
          hasFlag(mask, INPUT_FLAGS.FORWARD) ||
          hasFlag(mask, INPUT_FLAGS.BACKWARD) ||
          hasFlag(mask, INPUT_FLAGS.LEFT) ||
          hasFlag(mask, INPUT_FLAGS.RIGHT);

        const intensity = moveIntensity(physics?.velocity);
        this.weaponViewModel.update(
          dt,
          isMoving,
          !!weapon?.isReloading,
          intensity,
          aiming,
          stance
        );

        const grounded = physics?.isGrounded !== false;
        const playedFootstep = audio.updateFootsteps(dt, isMoving, grounded, stance);
        if (playedFootstep) {
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'footstep',
            sourceId: localEntity.player?.id,
            position: bodyPosition ? { x: bodyPosition.x, y: bodyPosition.y, z: bodyPosition.z } : { ...transform.position },
            stance,
          });
        }
        if (!this._wasGrounded && grounded) {
          audio.playLand();
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'land',
            sourceId: localEntity.player?.id,
            position: bodyPosition ? { x: bodyPosition.x, y: bodyPosition.y, z: bodyPosition.z } : { ...transform.position },
          });
        }
        if (this._wasGrounded && !grounded && hasFlag(mask, INPUT_FLAGS.JUMP)) {
          audio.playJump();
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'jump',
            sourceId: localEntity.player?.id,
            position: bodyPosition ? { x: bodyPosition.x, y: bodyPosition.y, z: bodyPosition.z } : { ...transform.position },
          });
        }
        this._wasGrounded = grounded;
      }

      if (!this._audioUnlocked && document.pointerLockElement) {
        audio.unlock();
        this._audioUnlocked = true;
      }
    }
  }

  dispose() {
    this.weaponViewModel?.dispose();
    audio.stopCombatAmbience?.();
    this.weaponViewModel = null;
  }
}
