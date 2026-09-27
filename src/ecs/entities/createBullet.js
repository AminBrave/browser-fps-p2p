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
  normal = { x: 0, y: 1, z: 0 },
  targetMesh = null
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
  n.normalize();

  // Use the Rapier hit point directly in world space. This deliberately avoids
  // projected decals: projected decals are sensitive to a mesh's local transform,
  // while this patch is guaranteed to sit on the exact physics surface.
  const point = new THREE.Vector3(position.x, position.y, position.z)
    .addScaledVector(n, 0.0015);

  const group = new THREE.Group();
  group.name = 'bulletImpact';
  group.renderOrder = 20;

  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    n
  );

  const makePatch = (radius, color, opacity, segments = 20) => {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, segments),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    mesh.position.copy(point);
    mesh.quaternion.copy(q);
    return mesh;
  };

  const hole = makePatch(0.07, 0x120c08, 0.96, 20);
  hole.name = 'bulletHole';
  group.add(hole);

  const scorch = makePatch(0.12, 0x3a2814, 0.62, 24);
  scorch.name = 'bulletScorch';
  group.add(scorch);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 6, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false,
    })
  );
  flash.name = 'impactFlash';
  flash.position.copy(point);
  group.add(flash);

  scene?.add?.(group);

  const entity = ecsWorld.add({
    isImpact: true,
    isPermanentDecal: true,
    transform: createTransform(point.x, point.y, point.z),
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
export function createImpact(ecsWorld, sceneOrManager, position, normal, targetMesh = null) {
  return createImpactDecal(ecsWorld, sceneOrManager, position, normal, targetMesh);
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

export function createBloodImpact(ecsWorld, sceneOrManager, position, normal) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
  n.normalize();
  const point = new THREE.Vector3(position.x, position.y, position.z).addScaledVector(n, 0.003);
  const group = new THREE.Group(); group.name = 'bloodImpact'; group.renderOrder = 21;
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), new THREE.MeshBasicMaterial({ color: 0x8f1010, transparent: true, opacity: 0.88, side: THREE.FrontSide, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  stain.position.copy(point); stain.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), n); group.add(stain);
  const tangent = new THREE.Vector3().crossVectors(Math.abs(n.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0), n).normalize();
  const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize();
  for (let i=0;i<5;i++) { const a=i*Math.PI*2/5; const drop=new THREE.Mesh(new THREE.SphereGeometry(0.008+i*0.001,5,4),new THREE.MeshBasicMaterial({color:0x8f1010,transparent:true,opacity:0.8,depthTest:true,depthWrite:false})); drop.position.copy(point).addScaledVector(tangent,Math.cos(a)*0.015).addScaledVector(bitangent,Math.sin(a)*0.015).addScaledVector(n,0.006); group.add(drop); }
  scene?.add?.(group); return ecsWorld.add({isImpact:true,isBloodImpact:true,isPermanentDecal:true,transform:createTransform(point.x,point.y,point.z),renderMesh:{mesh:group},impactFlashUntil:performance.now()+70});
}
