// src/ecs/entities/createBullet.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { GAME_CONFIG } from '../../config/constants.js';

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
    lifespan: { createdAt: performance.now(), durationMs: 60 },
  });
}

/**
 * Permanent bullet hole lying ON the hit surface, facing outward along normal.
 * Cap: GAME_CONFIG.MAX_DECALS (default 100).
 */
export function createImpactDecal(
  ecsWorld,
  sceneOrManager,
  position,
  normal = { x: 0, y: 1, z: 0 }
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
  n.normalize();

  const group = new THREE.Group();
  // Lift off surface along outward normal
  group.position.set(
    position.x + n.x * 0.03,
    position.y + n.y * 0.03,
    position.z + n.z * 0.03
  );

  // CircleGeometry lives in XY plane (local +Z is face normal).
  // Rotate so local +Z aligns with surface outward normal.
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 20),
    new THREE.MeshBasicMaterial({
      color: 0x120c08,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    })
  );
  group.add(hole);

  const scorch = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.18, 24),
    new THREE.MeshBasicMaterial({
      color: 0x3a2814,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    })
  );
  group.add(scorch);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 6, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.9,
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
    impactFlashUntil: performance.now() + 90,
  });

  _permanentDecals.push({ entity, scene });
  const max = GAME_CONFIG.MAX_DECALS || 100;
  while (_permanentDecals.length > max) {
    const old = _permanentDecals.shift();
    if (old?.entity?.renderMesh?.mesh) {
      (old.scene || scene)?.remove(old.entity.renderMesh.mesh);
      old.entity.renderMesh.mesh.traverse?.((c) => {
        c.geometry?.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    try {
      if (old?.entity) ecsWorld.remove(old.entity);
    } catch {
      /* ignore */
    }
  }

  return entity;
}

export function createImpact(ecsWorld, sceneOrManager, position, normal) {
  return createImpactDecal(ecsWorld, sceneOrManager, position, normal);
}
