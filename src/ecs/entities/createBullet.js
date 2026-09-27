import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { GAME_CONFIG, RENDER_CONFIG } from '../../config/index.js';

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
  targetMesh = null,
  targetEntity = null
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
  n.normalize();

  // The physics hit is world-space, but many targets are children of a
  // transformed root (cars, signs, trees, etc.). Parent the impact to the
  // exact visual hit mesh and convert both point and normal into that mesh's
  // local space. This makes the impact follow the same transform hierarchy as
  // the surface instead of being drawn in a second, unrelated coordinate space.
  const point = new THREE.Vector3(position.x, position.y, position.z)
    .addScaledVector(n, 0.002);

  if (targetMesh?.updateWorldMatrix) {
    targetMesh.updateWorldMatrix(true, false);
  }

  const localPoint = targetMesh?.worldToLocal
    ? targetMesh.worldToLocal(point.clone())
    : point.clone();

  let localNormal = n.clone();
  if (targetMesh?.worldToLocal) {
    const normalPoint = targetMesh.worldToLocal(
      point.clone().addScaledVector(n, 1)
    );
    localNormal = normalPoint.sub(localPoint).normalize();
  }
  if (localNormal.lengthSq() < 1e-8) localNormal.set(0, 1, 0);

  const group = new THREE.Group();
  group.name = 'bulletImpact';
  group.renderOrder = 20;

  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    localNormal
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
    mesh.position.copy(localPoint);
    mesh.quaternion.copy(q);
    return mesh;
  };

  const hole = makePatch(0.07, 0x120c08, 0.96, 20);
  hole.name = 'bulletHole';
  group.add(hole);

  const scorch = makePatch(0.12, 0x3a2814, 0.62, 24);
  scorch.name = 'bulletScorch';
  group.add(scorch);

  const sparkGroup = new THREE.Group();
  sparkGroup.name = 'impactSpark';
  sparkGroup.position.copy(localPoint);
  sparkGroup.quaternion.copy(q);

  const cfg = RENDER_CONFIG.IMPACT_FLASH;
  const tangent = new THREE.Vector3().crossVectors(
    Math.abs(localNormal.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0),
    localNormal
  ).normalize();
  const bitangent = new THREE.Vector3().crossVectors(localNormal, tangent).normalize();

  const materials = [
    new THREE.MeshBasicMaterial({ color: 0xfff4b0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
  ];

  const spawnSpark = (chunky) => {
    const azimuth = Math.random() * Math.PI * 2;
    const elevation = Math.random() * Math.PI * 0.5;
    const radial = Math.sin(elevation);
    const normalBias = Math.cos(elevation);
    const tangentSpeed = cfg.TANGENTIAL_SPEED_MIN + Math.random() * (cfg.TANGENTIAL_SPEED_MAX - cfg.TANGENTIAL_SPEED_MIN);
    const normalSpeed = cfg.NORMAL_SPEED_MIN + Math.random() * (cfg.NORMAL_SPEED_MAX - cfg.NORMAL_SPEED_MIN);
    const size = chunky ? cfg.BLOCK_SIZE_MIN + Math.random() * (cfg.BLOCK_SIZE_MAX - cfg.BLOCK_SIZE_MIN) : cfg.SPARK_SIZE_MIN + Math.random() * (cfg.SPARK_SIZE_MAX - cfg.SPARK_SIZE_MIN);
    const length = chunky ? size * (0.8 + Math.random() * 0.7) : cfg.SPARK_LENGTH_MIN + Math.random() * (cfg.SPARK_LENGTH_MAX - cfg.SPARK_LENGTH_MIN);
    const spark = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, length),
      materials[Math.floor(Math.random() * materials.length)].clone()
    );
    spark.name = 'spark';
    spark.position.copy(localNormal).multiplyScalar(cfg.SPAWN_OFFSET);
    spark.position.addScaledVector(tangent, Math.cos(azimuth) * radial * cfg.PATTERN_RADIUS);
    spark.position.addScaledVector(bitangent, Math.sin(azimuth) * radial * cfg.PATTERN_RADIUS);
    const direction = localNormal.clone().multiplyScalar(normalBias)
      .addScaledVector(tangent, Math.cos(azimuth) * radial * cfg.TANGENT_DIRECTION)
      .addScaledVector(bitangent, Math.sin(azimuth) * radial * cfg.TANGENT_DIRECTION)
      .normalize();
    spark.rotation.set((Math.random() - 0.5) * Math.PI, (Math.random() - 0.5) * Math.PI, Math.random() * Math.PI * 2);
    spark.userData.velocity = direction.multiplyScalar(Math.max(normalSpeed, tangentSpeed));
    spark.userData.drag = cfg.DRAG_MIN + Math.random() * (cfg.DRAG_MAX - cfg.DRAG_MIN);
    spark.userData.gravity = cfg.GRAVITY * (0.7 + Math.random() * 0.6);
    spark.userData.age = -(Math.random() * cfg.SPAWN_DELAY_MS / 1000);
    spark.userData.baseScale = 0.75 + Math.random() * 0.7;
    spark.userData.angularVelocity = { x: (Math.random() - 0.5) * 18, y: (Math.random() - 0.5) * 18, z: (Math.random() - 0.5) * 18 };
    sparkGroup.add(spark);
  };
  for (let i = 0; i < cfg.SPARK_COUNT; i++) spawnSpark(false);
  for (let i = 0; i < cfg.BLOCK_COUNT; i++) spawnSpark(true);
  group.add(sparkGroup);

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
  flash.position.copy(localPoint);
  group.add(flash);

  if (targetMesh) targetMesh.add(group);
  else scene?.add?.(group);

  const entity = ecsWorld.add({
    isImpact: true,
    isPermanentDecal: true,
    transform: createTransform(point.x, point.y, point.z),
    renderMesh: { mesh: group },
    impactFlashUntil: performance.now() + 90,
    impactSparkUntil: performance.now() + 180,
    impactSparkStartedAt: performance.now(),
    impactMarkOwner: targetEntity?.player ? targetEntity : null,
    isPlayerImpactMark: !!targetEntity?.player,
    impactHealthOpacity: 1,
    impactHealthOpacity: 1,
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
      oldMesh.parent?.remove?.(oldMesh);
      scene?.remove?.(oldMesh);
      disposeObject3D(oldMesh);
    }
    if (oldEntity) ecsWorld.remove(oldEntity);
  }

  return entity;
}
export function createImpact(ecsWorld, sceneOrManager, position, normal, targetMesh = null, targetEntity = null) {
  return createImpactDecal(ecsWorld, sceneOrManager, position, normal, targetMesh, targetEntity);
}

export function updatePlayerImpactMarksForHealth(ecsWorld, playerEntity, health, maxHealth) {
  const decals = decalRegistry.get(ecsWorld);
  if (!decals || !playerEntity) return;

  const max = Math.max(1, Number(maxHealth) || 100);
  const current = THREE.MathUtils.clamp(Number(health) || 0, 0, max);
  // 0 health => full visual damage, 100% health => no visible impacts.
  const healthOpacity = 1 - current / max;

  for (const entity of decals) {
    if (!entity?.isPlayerImpactMark || entity.impactMarkOwner !== playerEntity) continue;
    const mesh = entity.renderMesh?.mesh;
    if (!mesh) continue;

    entity.impactHealthOpacity = healthOpacity;
    mesh.visible = healthOpacity > 0;

    mesh.traverse?.((child) => {
      const material = child.material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        if (mat.userData?.impactBaseOpacity == null) {
          mat.userData.impactBaseOpacity = mat.opacity ?? 1;
        }
        mat.opacity = mat.userData.impactBaseOpacity * healthOpacity;
        mat.transparent = true;
        mat.needsUpdate = true;
      }
    });
  }
}

export function getPlayerImpactMarkCount(ecsWorld, playerEntity) {
  const decals = decalRegistry.get(ecsWorld);
  if (!decals || !playerEntity) return 0;
  return decals.filter((e) =>
    e?.isPlayerImpactMark &&
    e?.impactMarkOwner === playerEntity &&
    e?.renderMesh?.mesh
  ).length;
}

export function clearPlayerImpactMarks(ecsWorld, playerEntity, fraction) {
  const decals = decalRegistry.get(ecsWorld);
  if (!decals || !playerEntity) return 0;
  const amount = THREE.MathUtils.clamp(Number(fraction) || 0, 0, 1);
  const marks = decals.filter((e) => e?.isPlayerImpactMark && e?.impactMarkOwner === playerEntity && e?.renderMesh?.mesh);
  const removeCount = Math.min(marks.length, Math.floor(marks.length * amount + 1e-6));
  for (let i = 0; i < removeCount; i++) {
    const e = marks[i]; const mesh = e.renderMesh.mesh;
    mesh.parent?.remove?.(mesh); disposeObject3D(mesh);
    const idx = decals.indexOf(e); if (idx >= 0) decals.splice(idx, 1);
    ecsWorld.remove(e);
  }
  return removeCount;
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

export function createBloodImpact(ecsWorld, sceneOrManager, position, normal, targetMesh = null, targetEntity = null) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
  n.normalize();

  const point = new THREE.Vector3(position.x, position.y, position.z).addScaledVector(n, 0.003);
  if (targetMesh?.updateWorldMatrix) targetMesh.updateWorldMatrix(true, false);

  const localPoint = targetMesh?.worldToLocal
    ? targetMesh.worldToLocal(point.clone())
    : point.clone();
  let localNormal = n.clone();
  if (targetMesh?.worldToLocal) {
    localNormal = targetMesh.worldToLocal(point.clone().addScaledVector(n, 1))
      .sub(localPoint).normalize();
  }

  const group = new THREE.Group();
  group.name = 'bloodImpact';
  group.renderOrder = 21;

  const stain = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 16),
    new THREE.MeshBasicMaterial({
      color: 0x8f1010, transparent: true, opacity: 0.88,
      side: THREE.DoubleSide, depthTest: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    })
  );
  stain.position.copy(localPoint);
  stain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
  group.add(stain);

  const tangent = new THREE.Vector3()
    .crossVectors(Math.abs(localNormal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), localNormal)
    .normalize();
  const bitangent = new THREE.Vector3().crossVectors(localNormal, tangent).normalize();

  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.008 + i * 0.001, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0x8f1010, transparent: true, opacity: 0.8, depthTest: true, depthWrite: false })
    );
    drop.position.copy(localPoint)
      .addScaledVector(tangent, Math.cos(a) * 0.015)
      .addScaledVector(bitangent, Math.sin(a) * 0.015)
      .addScaledVector(localNormal, 0.006);
    group.add(drop);
  }

  if (targetMesh) targetMesh.add(group);
  else scene?.add?.(group);

  const entity = ecsWorld.add({
    isImpact: true,
    isBloodImpact: true,
    isPermanentDecal: true,
    transform: createTransform(point.x, point.y, point.z),
    renderMesh: { mesh: group },
    impactFlashUntil: performance.now() + 70,
    impactMarkOwner: targetEntity?.player ? targetEntity : null,
    isPlayerImpactMark: !!targetEntity?.player,
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
    oldMesh?.parent?.remove?.(oldMesh);
    disposeObject3D(oldMesh);
    if (oldEntity) ecsWorld.remove(oldEntity);
  }

  return entity;
}
