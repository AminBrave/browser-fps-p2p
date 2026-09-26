// src/ecs/entities/createBullet.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';

/** Instant tracer from muzzle to impact */
export function createBullet(ecsWorld, sceneOrManager, startPos, endPos) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const points = [
    new THREE.Vector3(startPos.x, startPos.y, startPos.z),
    new THREE.Vector3(endPos.x, endPos.y, endPos.z),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xffe08a,
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
    lifespan: { createdAt: performance.now(), durationMs: 70 },
  });
}

/**
 * Persistent-looking bullet hole / burn mark on surface.
 * Lives several seconds so impacts are clearly visible.
 */
export function createImpactDecal(
  ecsWorld,
  sceneOrManager,
  position,
  normal = { x: 0, y: 1, z: 0 }
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const group = new THREE.Group();
  // Offset slightly along normal to avoid z-fighting
  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 0.01) n.set(0, 1, 0);
  n.normalize();

  group.position.set(
    position.x + n.x * 0.02,
    position.y + n.y * 0.02,
    position.z + n.z * 0.02
  );

  // Dark bullet hole
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 16),
    new THREE.MeshBasicMaterial({
      color: 0x1a120c,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  // Orient circle to face outward along normal
  hole.lookAt(n.clone().add(new THREE.Vector3()));
  // lookAt makes local +Z face target; we want plane along normal
  hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  group.add(hole);

  // Scorch ring
  const scorch = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.14, 20),
    new THREE.MeshBasicMaterial({
      color: 0x3d2a1a,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  scorch.quaternion.copy(hole.quaternion);
  group.add(scorch);

  // Brief bright flash core
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 6, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.9,
    })
  );
  group.add(flash);

  if (scene?.add) scene.add(group);

  return ecsWorld.add({
    isImpact: true,
    transform: createTransform(position.x, position.y, position.z),
    renderMesh: { mesh: group },
    lifespan: {
      createdAt: performance.now(),
      durationMs: 8000, // long-lived decal
      flashDurationMs: 120,
    },
  });
}

/** @deprecated use createImpactDecal */
export function createImpact(ecsWorld, sceneOrManager, position, normal) {
  return createImpactDecal(ecsWorld, sceneOrManager, position, normal);
}
