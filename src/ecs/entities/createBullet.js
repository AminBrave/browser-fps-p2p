import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { createTransform } from '../components/Transform.js';
import { GAME_CONFIG } from '../../config/constants.js';

const decalRegistry = new WeakMap();

function disposeObject3D(root) {
  root?.traverse?.((child) => {
    child.geometry?.dispose();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose());
    else material?.dispose?.();
  });
}

function surfaceBasis(normal) {
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const reference = Math.abs(n.y) < 0.92
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(reference, n).normalize();
  const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize();
  return { n, tangent, bitangent };
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
  targetMesh = null,
  options = {}
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const { n, tangent, bitangent } = surfaceBasis(normal);

  // Keep the decal almost coplanar with the raycast surface. The epsilon is
  // deliberately sub-millimetre in world units (1 unit = 1 metre), so it
  // cannot visibly float while still avoiding depth-buffer z-fighting.
  const surfacePoint = new THREE.Vector3(
    position.x + n.x * 0.0008,
    position.y + n.y * 0.0008,
    position.z + n.z * 0.0008
  );

  const group = new THREE.Group();
  group.name = options.blood ? 'bloodImpact' : 'bulletImpact';
  group.renderOrder = 20;

  let surface = targetMesh?.isMesh ? targetMesh : null;
  if (surface) surface.updateWorldMatrix(true, false);

  if (surface) {
    const orientation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        n
      )
    );

    // DecalGeometry clips against the actual target mesh, rather than placing
    // a plane in free space. Its world-space point and normal are derived from
    // the same Rapier hit, so rotated/compound parts remain locked to surfaces.
    const size = options.blood
      ? new THREE.Vector3(0.11, 0.11, 0.025)
      : new THREE.Vector3(0.16, 0.16, 0.025);

    const geometry = new DecalGeometry(
      surface,
      surfacePoint,
      orientation,
      size
    );

    const material = new THREE.MeshBasicMaterial({
      color: options.blood ? 0x8f1010 : 0x16100b,
      transparent: true,
      opacity: options.blood ? 0.92 : 0.88,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const decal = new THREE.Mesh(geometry, material);
    decal.name = options.blood ? 'bloodSurface' : 'bulletHole';
    group.add(decal);
  } else {
    // Fallback for an unmapped collider: a surface-locked disk, never a sphere
    // placed at an arbitrary distance from the hit.
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(options.blood ? 0.055 : 0.08, 20),
      new THREE.MeshBasicMaterial({
        color: options.blood ? 0x8f1010 : 0x16100b,
        transparent: true,
        opacity: options.blood ? 0.9 : 0.82,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    disk.position.copy(surfacePoint);
    disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    group.add(disk);
  }

  if (!options.blood) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false,
      })
    );
    flash.position.copy(surfacePoint);
    flash.name = 'impactFlash';
    group.add(flash);
  }

  if (options.blood) {
    // A compact spray is emitted from the exact surface point. Droplets are
    // biased along the outward normal, with deterministic-looking variation
    // around the tangent plane. They are visual evidence of the same hit and
    // do not participate in collision physics.
    const dropletCount = 7;
    for (let i = 0; i < dropletCount; i++) {
      const angle = (i / dropletCount) * Math.PI * 2 + 0.35;
      const tangentAmount = 0.008 + (i % 3) * 0.004;
      const outward = 0.012 + (i % 4) * 0.007;
      const point = surfacePoint.clone()
        .addScaledVector(tangent, Math.cos(angle) * tangentAmount)
        .addScaledVector(bitangent, Math.sin(angle) * tangentAmount)
        .addScaledVector(n, outward);

      const droplet = new THREE.Mesh(
        new THREE.SphereGeometry(0.009 + (i % 3) * 0.002, 5, 4),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0x6f0909 : 0xb71919,
          transparent: true,
          opacity: 0.82,
          depthTest: true,
          depthWrite: false,
        })
      );
      droplet.position.copy(point);
      group.add(droplet);
    }
  }

  scene?.add?.(group);

  const entity = ecsWorld.add({
    isImpact: true,
    isBloodImpact: !!options.blood,
    isPermanentDecal: true,
    transform: createTransform(surfacePoint.x, surfacePoint.y, surfacePoint.z),
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

export function createBloodImpact(ecsWorld, sceneOrManager, position, normal, targetMesh = null) {
  return createImpactDecal(
    ecsWorld,
    sceneOrManager,
    position,
    normal,
    targetMesh,
    { blood: true }
  );
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
