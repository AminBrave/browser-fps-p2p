// src/ecs/entities/createBullet.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';

/**
 * Entity Assembler: Bullet Tracers / Visual Hits
 * Spawns an instant hitscan visual tracer beam in the Three.js scene graph 
 * that automatically fades and cleans itself up after a brief duration.
 * 
 * @param {object} ecsWorld - The Miniplex ECS world instance.
 * @param {object|THREE.Scene} sceneOrManager - SceneManager instance or direct THREE.Scene.
 * @param {{x: number, y: number, z: number}} startPos - Bullet muzzle start point.
 * @param {{x: number, y: number, z: number}} endPos - Bullet target/impact point.
 * @returns {object} The created Miniplex bullet entity object.
 */
export function createBullet(ecsWorld, sceneOrManager, startPos, endPos) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

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
  if (scene && typeof scene.add === 'function') {
    scene.add(lineMesh);
  }

  // Register in Miniplex
  const bulletEntity = ecsWorld.add({
    isBullet: true,
    transform: createTransform(startPos.x, startPos.y, startPos.z),
    renderMesh: { mesh: lineMesh },
    lifespan: {
      createdAt: performance.now(),
      durationMs: 100,
    },
  });

  return bulletEntity;
}