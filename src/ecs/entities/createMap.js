// src/ecs/entities/createMap.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { GAME_CONFIG } from '../../config/constants.js';

function addToScene(sceneManager, mesh) {
  if (sceneManager?.scene) sceneManager.scene.add(mesh);
  else if (typeof sceneManager?.add === 'function') sceneManager.add(mesh);
}

function addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, opts) {
  const { x, y, z, sx, sy, sz, color, roughness = 0.7, name = 'box' } = opts;
  const phys = physicsWorld.createStaticBox(x, y, z, sx / 2, sy / 2, sz / 2);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  addToScene(sceneManager, mesh);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, y, z),
      physics: createPhysics(phys.body, phys.collider),
      renderMesh: { mesh },
    })
  );
}

function addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, x, z) {
  const trunkH = 2.2 + Math.random() * 1.2;
  const trunkR = 0.25 + Math.random() * 0.1;
  // Trunk collider
  const trunkPhys = physicsWorld.createStaticBox(
    x, trunkH / 2, z,
    trunkR, trunkH / 2, trunkR
  );

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.85, trunkR, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.28 + Math.random() * 0.08, 0.55, 0.35),
    roughness: 0.85,
  });
  for (let i = 0; i < 3; i++) {
    const r = 1.4 - i * 0.3;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, 1.8 - i * 0.2, 8),
      leafMat
    );
    cone.position.y = trunkH + 0.4 + i * 0.9;
    cone.castShadow = true;
    group.add(cone);
  }

  addToScene(sceneManager, group);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, trunkH / 2, z),
      physics: createPhysics(trunkPhys.body, trunkPhys.collider),
      renderMesh: { mesh: group },
    })
  );
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, x, z, rotY = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: [0x2e86de, 0xee5a24, 0x10ac84, 0xf368e0][Math.floor(Math.random() * 4)],
    metalness: 0.4,
    roughness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.65, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.3, roughness: 0.4 })
  );
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
  const wheelPos = [
    [1.1, 0.35, 1.3],
    [-1.1, 0.35, 1.3],
    [1.1, 0.35, -1.3],
    [-1.1, 0.35, -1.3],
  ];
  for (const [wx, wy, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    group.add(w);
  }

  // Physics box approx
  const phys = physicsWorld.createStaticBox(x, 0.7, z, 1.1, 0.7, 2.1);
  addToScene(sceneManager, group);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, 0.7, z),
      physics: createPhysics(phys.body, phys.collider),
      renderMesh: { mesh: group },
    })
  );
}

/**
 * Sunny outdoor arena: grass, trees, cars, crates, cover.
 */
export function createMap(ecsWorld, physicsWorld, sceneManager) {
  const mapEntities = [];
  const { WIDTH, LENGTH } = GAME_CONFIG.MAP_BOUNDS;

  // Grass floor
  const floorPhys = physicsWorld.createStaticBox(0, -0.1, 0, WIDTH / 2, 0.1, LENGTH / 2);
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH, 0.2, LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x3d8b4f, roughness: 0.95 })
  );
  floorMesh.position.set(0, -0.1, 0);
  floorMesh.receiveShadow = true;
  addToScene(sceneManager, floorMesh);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(0, -0.1, 0),
      physics: createPhysics(floorPhys.body, floorPhys.collider),
      renderMesh: { mesh: floorMesh },
    })
  );

  // Dirt paths
  for (const [px, pz, sx, sz] of [
    [0, 0, 6, 40],
    [0, 0, 40, 6],
  ]) {
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(sx, 0.05, sz),
      new THREE.MeshStandardMaterial({ color: 0xc2a87c, roughness: 1 })
    );
    path.position.set(px, 0.02, pz);
    path.receiveShadow = true;
    addToScene(sceneManager, path);
  }

  // Cover crates / walls
  const crates = [
    { x: -12, y: 1, z: -8, sx: 3, sy: 2, sz: 3, color: 0xb8956c },
    { x: 12, y: 1, z: 8, sx: 3, sy: 2, sz: 3, color: 0xa67c52 },
    { x: -8, y: 1.25, z: 12, sx: 2.5, sy: 2.5, sz: 5, color: 0x7f8c8d },
    { x: 10, y: 1.25, z: -12, sx: 5, sy: 2.5, sz: 2.5, color: 0x7f8c8d },
    { x: 0, y: 1, z: 0, sx: 4, sy: 2, sz: 4, color: 0x95a5a6 },
    { x: -18, y: 0.6, z: 0, sx: 2, sy: 1.2, sz: 2, color: 0xd35400 },
    { x: 18, y: 0.6, z: 0, sx: 2, sy: 1.2, sz: 2, color: 0x2980b9 },
  ];
  for (const c of crates) {
    addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, c);
  }

  // Trees ring
  const treePositions = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    treePositions.push([
      Math.cos(a) * 28 + (Math.random() - 0.5) * 4,
      Math.sin(a) * 28 + (Math.random() - 0.5) * 4,
    ]);
  }
  treePositions.push([-6, -18], [8, 20], [-22, 10], [20, -15]);
  for (const [tx, tz] of treePositions) {
    addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, tx, tz);
  }

  // Cars
  addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, -5, 14, 0.4);
  addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, 8, -16, -0.8);
  addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, 16, 6, 1.2);

  // Low barriers
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
      x: i * 3,
      y: 0.4,
      z: 6,
      sx: 2.5,
      sy: 0.8,
      sz: 0.4,
      color: 0xf1c40f,
      name: 'barrier',
    });
  }

  return mapEntities;
}
