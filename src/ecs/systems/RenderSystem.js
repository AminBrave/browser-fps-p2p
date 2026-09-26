// src/ecs/systems/RenderSystem.js

import * as THREE from 'three';

/**
 * RenderSystem
 * Synchronizes ECS Transform positions and orientations with Three.js Scene Meshes,
 * drives local FPS camera position and recoil offsets, and purges expired visual entities.
 */
export class RenderSystem {
  /**
   * @param {object|THREE.Scene} sceneOrManager - SceneManager wrapper instance or direct THREE.Scene instance.
   * @param {THREE.Camera} [camera] - Optional direct camera instance if sceneOrManager is raw Scene.
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
  }

  /**
   * Main system update loop run every frame prior to WebGL rendering.
   * Supports both Miniplex v2 world queries and legacy argument signatures.
   * 
   * @param {object} ecsWorld - The Miniplex ECS world instance.
   * @param {object|Array|number} [renderableEntitiesOrLocalEntity] - Local entity object/ID or legacy entities array.
   * @param {object|number} [localEntityOrTime] - Local entity object/ID or current performance timestamp.
   * @param {number} [currentTime] - Current timestamp in milliseconds.
   */
  update(ecsWorld, renderableEntitiesOrLocalEntity, localEntityOrTime, currentTime) {
    const now = typeof currentTime === 'number' 
      ? currentTime 
      : (typeof localEntityOrTime === 'number' ? localEntityOrTime : performance.now());

    // Resolve local player entity reference across parameter variants
    let localEntity = null;
    if (renderableEntitiesOrLocalEntity && typeof renderableEntitiesOrLocalEntity === 'object' && renderableEntitiesOrLocalEntity.transform) {
      localEntity = renderableEntitiesOrLocalEntity;
    } else if (localEntityOrTime && typeof localEntityOrTime === 'object' && localEntityOrTime.transform) {
      localEntity = localEntityOrTime;
    }

    // 1. Update 3D Mesh positions, rotations, and lifetimes for renderable entities
    const renderables = ecsWorld.with('transform', 'renderMesh');

    for (const entity of renderables) {
      const transform = entity.transform;
      const renderMesh = entity.renderMesh;
      const lifespan = entity.lifespan;

      // Process and destroy expired temporary visual entities (e.g., bullet tracers)
      if (lifespan) {
        const elapsed = now - lifespan.createdAt;
        if (elapsed >= lifespan.durationMs) {
          if (renderMesh && renderMesh.mesh) {
            if (this.scene) {
              this.scene.remove(renderMesh.mesh);
            } else if (this.sceneManager && typeof this.sceneManager.remove === 'function') {
              this.sceneManager.remove(renderMesh.mesh);
            }
            if (renderMesh.mesh.geometry) renderMesh.mesh.geometry.dispose();
            if (renderMesh.mesh.material) renderMesh.mesh.material.dispose();
          }
          ecsWorld.remove(entity);
          continue;
        } else if (renderMesh && renderMesh.mesh && renderMesh.mesh.material) {
          // Fade opacity over remaining life
          renderMesh.mesh.material.opacity = 1 - elapsed / lifespan.durationMs;
        }
      }

      if (!transform || !renderMesh || !renderMesh.mesh) continue;

      // Sync position with ECS Transform component
      renderMesh.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z
      );

      // Sync rotation (Yaw around Y-axis)
      const yaw = transform.rotation ? (transform.rotation.y || transform.rotation.yaw || 0) : 0;
      renderMesh.mesh.rotation.y = yaw;
    }

    // 2. Attach and update Local FPS Camera
    if (!localEntity) {
      // Attempt to find local player entity from Miniplex world if not passed explicitly
      const players = ecsWorld.with('player', 'transform', 'input');
      for (const entity of players) {
        if (entity.player && entity.player.isLocal) {
          localEntity = entity;
          break;
        }
      }
    }

    if (localEntity && localEntity.transform && localEntity.input && this.camera) {
      const transform = localEntity.transform;
      const input = localEntity.input;
      const eyeY = transform.position.y + 1.6; // Eye level offset

      this.camera.position.set(
        transform.position.x,
        eyeY,
        transform.position.z
      );

      // Apply pitch and yaw look angles to Euler rotation matrix
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.x = input.pitch || 0;
      euler.y = input.yaw || 0;
      this.camera.quaternion.setFromEuler(euler);
    }

    // Render WebGL scene frame if SceneManager is present
    if (this.sceneManager && typeof this.sceneManager.render === 'function') {
      this.sceneManager.render();
    }
  }
}