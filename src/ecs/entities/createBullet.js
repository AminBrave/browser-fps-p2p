// src/ecs/entities/createBullet.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { GAME_CONFIG } from '../../config/constants.js';

/** @type {object[]} permanent impact entities for FIFO cap */
const _permanentDecals = [];

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
 * Permanent bullet hole oriented to surface normal (camera sees it on that face).
 * Never auto-removed; oldest dropped when MAX_DECALS exceeded.
 */
export function createImpactDecal(
  ecsWorld,
  sceneOrManager,
  position,
  normal = { x: 0, y: 1, z: 0 }
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
  n.normalize();

  const group = new THREE.Group();
  // Sit slightly off the surface along the normal to avoid z-fight
  group.position.set(
    position.x + n.x * 0.025,
    position.y + n.y * 0.025,
    position.z + n.z * 0.025
  );

  // Align local +Z with surface normal so the disc lies on the plane
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

  const holeMat = new THREE.MeshBasicMaterial({
    color: 0x1a1008,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.08, 18), holeMat);
  group.add(hole);

  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x3a2818,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const scorch = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.16, 22), scorchMat);
  group.add(scorch);

  // Brief flash (this one CAN fade via a short lifespan flag on a child only)
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 6, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.95,
    })
  );
  flash.name = 'impactFlash';
  group.add(flash);

  if (scene?.add) scene.add(group);

  const entity = ecsWorld.add({
    isImpact: true,
    isPermanentDecal: true,
    transform: createTransform(position.x, position.y, position.z),
    renderMesh: { mesh: group },
    // Only the flash fades; decal itself is permanent (no entity removal)
    impactFlashUntil: performance.now() + 100,
  });

  _permanentDecals.push(entity);
  const max = GAME_CONFIG.MAX_DECALS || 400;
  while (_permanentDecals.length > max) {
    const old = _permanentDecals.shift();
    if (old?.renderMesh?.mesh) {
      scene?.remove(old.renderMesh.mesh);
      old.renderMesh.mesh.traverse?.((c) => {
        c.geometry?.dispose();
        c.material?.dispose?.();
      });
    }
    try {
      ecsWorld.remove(old);
    } catch {
      /* already gone */
    }
  }

  return entity;
}

export function createImpact(ecsWorld, sceneOrManager, position, normal) {
  return createImpactDecal(ecsWorld, sceneOrManager, position, normal);
}
