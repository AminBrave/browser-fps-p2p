// src/ecs/systems/RenderSystem.js

import * as THREE from 'three';

/**
 * RenderSystem
 * Synchronizes ECS Transform positions and orientations with Three.js Scene Meshes,
 * drives local FPS camera position and recoil offsets, and purges expired visual entities.
 */
export class RenderSystem {
  /**
   * @param {object} sceneManager - Wrapper holding Three.js Scene and Camera instances.
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.camera = sceneManager.camera;
  }

  /**
   * Main system update loop run every frame prior to WebGL rendering.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {Array<number>} renderableEntities - Entity IDs with RenderMesh & Transform components.
   * @param {number|null} localPlayerEntityId - Local player entity ID driving the FPS camera.
   * @param {number} currentTime - Current timestamp in milliseconds.
   */
  update(ecsWorld, renderableEntities, localPlayerEntityId, currentTime) {
    // 1. Update 3D Mesh positions and rotations from ECS components
    for (let i = 0; i < renderableEntities.length; i++) {
      const entityId = renderableEntities[i];
      const transform = ecsWorld.getComponent(entityId, 'Transform');
      const renderMesh = ecsWorld.getComponent(entityId, 'RenderMesh');
      const lifespan = ecsWorld.getComponent(entityId, 'Lifespan');

      // Process and destroy expired temporary visual entities (e.g., bullet tracers)
      if (lifespan) {
        const elapsed = currentTime - lifespan.createdAt;
        if (elapsed >= lifespan.durationMs) {
          if (renderMesh && renderMesh.mesh) {
            this.sceneManager.remove(renderMesh.mesh);
            if (renderMesh.mesh.geometry) renderMesh.mesh.geometry.dispose();
            if (renderMesh.mesh.material) renderMesh.mesh.material.dispose();
          }
          ecsWorld.destroyEntity(entityId);
          continue;
        } else if (renderMesh && renderMesh.mesh && renderMesh.mesh.material) {
          // Fade opacity over remaining life
          renderMesh.mesh.material.opacity = 1 - elapsed / lifespan.durationMs;
        }
      }

      if (!transform || !renderMesh || !renderMesh.mesh) continue;

      // Sync position
      renderMesh.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z
      );

      // Sync rotation (Yaw around Y-axis)
      renderMesh.mesh.rotation.y = transform.rotation.yaw;
    }

    // 2. Attach and update Local FPS Camera
    if (localPlayerEntityId !== null) {
      const transform = ecsWorld.getComponent(localPlayerEntityId, 'Transform');
      const input = ecsWorld.getComponent(localPlayerEntityId, 'Input');

      if (transform && input) {
        const eyeY = transform.position.y + 1.6; // Eye level offset

        this.camera.position.set(
          transform.position.x,
          eyeY,
          transform.position.z
        );

        // Apply pitch and yaw look angles to Euler rotation matrix
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.x = input.pitch;
        euler.y = input.yaw;
        this.camera.quaternion.setFromEuler(euler);
      }
    }

    // Render WebGL scene frame
    this.sceneManager.render();
  }
}