import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { GAME_CONFIG } from '../../config/constants.js';

// Scope decal ownership to an ECS world. A module-global array would retain
// entities/scenes after a match is destroyed.
const decalRegistry = new WeakMap();

function disposeObject3D(root) {
  root?.traverse?.((child) => {
    child.geometry?.dispose();
    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m?.dispose());
    } else {
      material?.dispose?.();
    }
  });
}

export function createBullet(ecsWorld, sceneOrManager, startPos, endPos) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(startPos.x, startPos.y, startPos.z),
    new THREE.Vector3(endPos.x, endPos.y, endPos.z),
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0xffe08a,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const lineMesh = new THREE.Line(geometry, material);
  lineMesh.renderOrder = 10;
  scene?.add?.(lineMesh);

  return ecsWorld.add({
    isBullet: true,
    transform: createTransform(startPos.x, startPos.y, startPos.z),
    renderMesh: { mesh: lineMesh },
    lifespan: { createdAt: performance.now(), durationMs: 60 },
  });
}

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
  group.position.set(
    position.x + n.x * 0.012,
    position.y + n.y * 0.012,
    position.z + n.z * 0.012
  );
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 20),
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
    new THREE.RingGeometry(0.06, 0.13, 24),
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

  scene?.add?.(group);

  const entity = ecsWorld.add({
    isImpact: true,
    isPermanentDecal: true,
    transform: createTransform(position.x, position.y, position.z),
    renderMesh: { mesh: group },
    impactFlashUntil: performance.now() + 90,
  });

  let decals = decalRegistry.get(ecsWorld);
  if (!decals) {
    decals = [];
    decalRegistry.set(ecsWorld, decals);
  }
  decals.push(entity);

  const max = GAME_CONFIG.MAX_DECALS || 100;
  while (decals.length > max) {
    const oldEntity = decals.shift();
    const oldMesh = oldEntity?.renderMesh?.mesh;
    if (oldMesh) {
      scene?.remove?.(oldMesh);
      disposeObject3D(oldMesh);
    }
    if (oldEntity) ecsWorld.remove(oldEntity);
  }

  return entity;
}

export function createImpact(ecsWorld, sceneOrManager, position, normal) {
  return createImpactDecal(ecsWorld, sceneOrManager, position, normal);
}

export function disposeImpactDecals(ecsWorld) {
  const decals = decalRegistry.get(ecsWorld);
  if (!decals) return;

  for (const entity of decals) {
    const mesh = entity?.renderMesh?.mesh;
    if (mesh) {
      mesh.parent?.remove(mesh);
      disposeObject3D(mesh);
    }
    if (entity) ecsWorld.remove(entity);
  }

  decals.length = 0;
  decalRegistry.delete(ecsWorld);
}
