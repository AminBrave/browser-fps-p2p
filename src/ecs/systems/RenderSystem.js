// src/ecs/systems/RenderSystem.js

import * as THREE from 'three';
import { GAME_CONFIG, INPUT_FLAGS } from '../../config/constants.js';
import { hasFlag } from '../../utils/BitFlags.js';
import { WeaponViewModel } from '../../render/WeaponViewModel.js';

/**
 * RenderSystem — mesh sync + FPS camera + weapon viewmodel.
 */
export class RenderSystem {
  /**
   * @param {object|THREE.Scene} sceneOrManager
   * @param {THREE.Camera} [camera]
   */
  constructor(sceneOrManager, camera = null) {
    if (sceneOrManager && sceneOrManager.scene) {
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
      // Safety: ensure camera is in the scene (weapon is a camera child)
      if (this.scene && !this.camera.parent) {
        this.scene.add(this.camera);
      }
      this.weaponViewModel = new WeaponViewModel(this.camera);
    }

    this._lastTime = performance.now();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  /**
   * @param {object} ecsWorld
   * @param {object} [localEntityArg]
   * @param {*} [_maybeTime]
   * @param {number} [currentTimeArg]
   */
  update(ecsWorld, localEntityArg, _maybeTime, currentTimeArg) {
    const now =
      typeof currentTimeArg === 'number'
        ? currentTimeArg
        : typeof _maybeTime === 'number'
          ? _maybeTime
          : performance.now();

    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;

    let localEntity = null;
    if (localEntityArg && typeof localEntityArg === 'object' && localEntityArg.transform) {
      localEntity = localEntityArg;
    }

    // World meshes
    for (const entity of ecsWorld.with('transform', 'renderMesh')) {
      const transform = entity.transform;
      const renderMesh = entity.renderMesh;
      const lifespan = entity.lifespan;

      if (lifespan) {
        const elapsed = now - lifespan.createdAt;
        if (elapsed >= lifespan.durationMs) {
          if (renderMesh?.mesh) {
            if (this.scene) this.scene.remove(renderMesh.mesh);
            renderMesh.mesh.geometry?.dispose();
            renderMesh.mesh.material?.dispose?.();
          }
          ecsWorld.remove(entity);
          continue;
        }
        if (renderMesh?.mesh?.material) {
          renderMesh.mesh.material.opacity = 1 - elapsed / lifespan.durationMs;
        }
      }

      if (!transform || !renderMesh?.mesh) continue;

      // Local body stays hidden (FPS view uses camera + viewmodel)
      if (entity.player?.isLocal) {
        renderMesh.mesh.visible = false;
        continue;
      }

      renderMesh.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z
      );

      const yaw = transform.rotation
        ? transform.rotation.yaw ?? transform.rotation.y ?? 0
        : 0;
      renderMesh.mesh.rotation.y = yaw;
    }

    if (!localEntity) {
      for (const entity of ecsWorld.with('player', 'transform', 'input')) {
        if (entity.player?.isLocal) {
          localEntity = entity;
          break;
        }
      }
    }

    // FPS camera + weapon
    if (localEntity?.transform && localEntity?.input && this.camera) {
      const transform = localEntity.transform;
      const input = localEntity.input;
      const eyeOffset = GAME_CONFIG.CAMERA_HEIGHT_OFFSET || 1.6;

      this.camera.position.set(
        transform.position.x,
        transform.position.y + eyeOffset,
        transform.position.z
      );

      this._euler.set(input.pitch || 0, input.yaw || 0, 0, 'YXZ');
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
        const isShooting = hasFlag(mask, INPUT_FLAGS.SHOOT);

        this.weaponViewModel.update(dt, isMoving, isShooting);
      }
    }
  }

  dispose() {
    if (this.weaponViewModel) {
      this.weaponViewModel.dispose();
      this.weaponViewModel = null;
    }
  }
}
