// src/ecs/systems/RenderSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, INPUT_FLAGS, STANCE, getPlayerEyeOffset } from '../../config/index.js';
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
  }

  setEventSink(eventSink) {
    this.eventSink = eventSink;
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

    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;

    let localEntity = localEntityArg?.transform ? localEntityArg : null;

    for (const entity of ecsWorld.with('transform', 'renderMesh')) {
      const transform = entity.transform;
      const renderMesh = entity.renderMesh;
      const lifespan = entity.lifespan;

      if (entity.isPermanentDecal && renderMesh?.mesh) {
        if (entity.impactFlashUntil && now < entity.impactFlashUntil) {
          const t = 1 - (entity.impactFlashUntil - now) / 90;
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
          maxHealth: entity.player.maxHealth ?? 100,
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

      // The Rapier body is the authoritative local placement. ECS transform
      // is a cached/render value and can briefly differ after controller
      // correction, reconciliation, or a kinematic step. The first-person
      // camera must never be driven from that stale cache: anchor it directly
      // to the actual body translation, then mirror that position back into
      // ECS so camera, visible remote representation, raycasts and gameplay
      // all share one coordinate.
      const bodyPosition = physics?.rigidBody?.translation?.();
      if (bodyPosition) {
        // The simulation is fixed at 60 Hz while rendering can run at a
        // different refresh rate. Interpolate the local visual/camera pose
        // between the two most recent fixed states instead of displaying the
        // discrete 60 Hz physics steps as screen jitter.
        if (!this._currentPosition) this.captureFixedState(localEntity);
        const previous = this._previousPosition || bodyPosition;
        const current = this._currentPosition || bodyPosition;
        const alpha = THREE.MathUtils.clamp(Number(renderAlpha) || 0, 0, 1);
        this._renderPosition = {
          x: THREE.MathUtils.lerp(previous.x, current.x, alpha),
          y: THREE.MathUtils.lerp(previous.y, current.y, alpha),
          z: THREE.MathUtils.lerp(previous.z, current.z, alpha),
        };
        transform.position.x = this._renderPosition.x;
        transform.position.y = this._renderPosition.y;
        transform.position.z = this._renderPosition.z;
      }

      // Keep the first-person eye anchored to the exact same head/pose
      // geometry used by the local player's character model. The physics
      // transform is the capsule centre, not the player's feet or head.
      localEntity.character?.updateVisuals?.({
        stance,
        pitch: input.pitch ?? 0,
        health: localEntity.player?.health ?? GAME_CONFIG.MAX_HEALTH,
        maxHealth: localEntity.player?.maxHealth ?? GAME_CONFIG.MAX_HEALTH,
        isDead: !!localEntity.player?.isDead,
      });

      const eyeOffset = getPlayerEyeOffset(stance);

      this.camera.position.set(
        transform.position.x,
        transform.position.y + eyeOffset,
        transform.position.z
      );

      if (weapon) {
        const recovery = (GAME_CONFIG.RECOIL_RECOVERY || 10) * dt;
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
        (input.pitch || 0) + (weapon?.cameraRecoilPitch || 0) * 0.2;
      const yaw =
        (input.yaw || 0) + (weapon?.cameraRecoilYaw || 0) * 0.2;

      this._euler.set(pitch, yaw, 0, 'YXZ');
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
          intensity
        );

        const grounded = physics?.isGrounded !== false;
        const playedFootstep = audio.updateFootsteps(dt, isMoving, grounded, stance);
        if (playedFootstep) {
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'footstep',
            sourceId: localEntity.player?.id,
            position: { ...transform.position },
            stance,
          });
        }
        if (!this._wasGrounded && grounded) {
          audio.playLand();
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'land',
            sourceId: localEntity.player?.id,
            position: { ...transform.position },
          });
        }
        if (this._wasGrounded && !grounded && hasFlag(mask, INPUT_FLAGS.JUMP)) {
          audio.playJump();
          this.eventSink?.({
            type: EVENT_TYPES.SFX,
            sfx: 'jump',
            sourceId: localEntity.player?.id,
            position: { ...transform.position },
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
    this.weaponViewModel = null;
  }
}
