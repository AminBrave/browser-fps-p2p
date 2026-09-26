// src/ecs/systems/RenderSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, INPUT_FLAGS } from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { WeaponViewModel } from '../../render/WeaponViewModel.js';
import { audio } from '../../audio/AudioManager.js';

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
    if (this.camera) {
      if (this.scene && !this.camera.parent) this.scene.add(this.camera);
      this.weaponViewModel = new WeaponViewModel(this.camera);
    }

    this._lastTime = performance.now();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._wasGrounded = true;
    this._audioUnlocked = false;
  }

  update(ecsWorld, localEntityArg, _maybeTime, currentTimeArg) {
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

      // Permanent decals: only fade the flash sphere, never remove
      if (entity.isPermanentDecal && renderMesh?.mesh) {
        if (entity.impactFlashUntil && now < entity.impactFlashUntil) {
          const t = 1 - (entity.impactFlashUntil - now) / 100;
          renderMesh.mesh.traverse((c) => {
            if (c.name === 'impactFlash' && c.material) {
              c.material.opacity = Math.max(0, 1 - t);
            }
          });
        } else if (entity.impactFlashUntil && now >= entity.impactFlashUntil) {
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
      const eyeOffset = GAME_CONFIG.CAMERA_HEIGHT_OFFSET || 1.6;

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
      }

      // Visual punch only — does not affect hitscan aim angles stored on input
      const pitch =
        (input.pitch || 0) + (weapon?.cameraRecoilPitch || 0) * 0.2;
      const yaw =
        (input.yaw || 0) + (weapon?.cameraRecoilYaw || 0) * 0.2;

      this._euler.set(pitch, yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this._euler);

      if (this.weaponViewModel) {
        const isDead = !!localEntity.player?.isDead;
        this.weaponViewModel.setVisible(!isDead);

        const mask = input.inputMask || 0;
        const isMoving =
          hasFlag(mask, INPUT_FLAGS.FORWARD) ||
          hasFlag(mask, INPUT_FLAGS.BACKWARD) ||
          hasFlag(mask, INPUT_FLAGS.LEFT) ||
          hasFlag(mask, INPUT_FLAGS.RIGHT);

        this.weaponViewModel.update(dt, isMoving, !!weapon?.isReloading);

        const grounded = physics?.isGrounded !== false;
        audio.updateFootsteps(dt, isMoving, grounded);
        if (!this._wasGrounded && grounded) audio.playLand();
        if (this._wasGrounded && !grounded && hasFlag(mask, INPUT_FLAGS.JUMP)) {
          audio.playJump();
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
