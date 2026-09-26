// src/ecs/entities/createBullet.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';

/**
 * Entity Assembler: Bullet Tracers / Visual Hits
 * Spawns an instant hitscan visual tracer beam in the Three.js scene graph 
 * that automatically fades and cleans itself up after a brief duration.
 * 
 * @param {object} ecsWorld - The ECS world instance.
 * @param {object} sceneManager - Wrapper class for Three.js scene management.
 * @param {{x: number, y: number, z: number}} startPos - Bullet muzzle start point.
 * @param {{x: number, y: number, z: number}} endPos - Bullet target/impact point.
 * @returns {number} The created bullet visual entity ID.
 */
export function createBullet(ecsWorld, sceneManager, startPos, endPos) {
  const entityId = ecsWorld.createEntity();

  // Create tracer line geometry from origin to target hit point
  const points = [
    new THREE.Vector3(startPos.x, startPos.y, startPos.z),
    new THREE.Vector3(endPos.x, endPos.y, endPos.z),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  // Bright yellow glowing material for visual feedback
  const material = new THREE.LineBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.9,
    linewidth: 2,
  });

  const lineMesh = new THREE.Line(geometry, material);
  sceneManager.add(lineMesh);

  // Attach ECS Components
  ecsWorld.addComponent(entityId, 'Transform', createTransform(startPos.x, startPos.y, startPos.z));
  ecsWorld.addComponent(entityId, 'RenderMesh', { mesh: lineMesh });

  // Lifespan metadata component for auto-destruction (fades out in 100ms)
  ecsWorld.addComponent(entityId, 'Lifespan', {
    createdAt: performance.now(),
    durationMs: 100,
  });

  return entityId;
}