// src/ecs/entities/createBullet.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';

/**
 * Instant hitscan tracer line (fades out quickly).
 */
export function createBullet(ecsWorld, sceneOrManager, startPos, endPos) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const points = [
    new THREE.Vector3(startPos.x, startPos.y, startPos.z),
    new THREE.Vector3(endPos.x, endPos.y, endPos.z),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color: 0xffe566,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const lineMesh = new THREE.Line(geometry, material);
  lineMesh.renderOrder = 10;
  if (scene?.add) scene.add(lineMesh);

  return ecsWorld.add({
    isBullet: true,
    transform: createTransform(startPos.x, startPos.y, startPos.z),
    renderMesh: { mesh: lineMesh },
    lifespan: {
      createdAt: performance.now(),
      durationMs: 80,
    },
  });
}

/**
 * Small impact spark / mark at hit point.
 */
export function createImpact(ecsWorld, sceneOrManager, position, normal = { x: 0, y: 1, z: 0 }) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);

  // Core flash
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 1,
    })
  );
  group.add(core);

  // Ring on surface
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  // Orient ring to surface normal
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  ring.lookAt(n);
  ring.position.copy(n.multiplyScalar(0.02));
  group.add(ring);

  if (scene?.add) scene.add(group);

  return ecsWorld.add({
    isImpact: true,
    transform: createTransform(position.x, position.y, position.z),
    renderMesh: { mesh: group },
    lifespan: {
      createdAt: performance.now(),
      durationMs: 180,
    },
  });
}
