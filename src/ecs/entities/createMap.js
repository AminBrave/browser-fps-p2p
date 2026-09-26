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
  const trunkH = 2.4 + Math.random() * 1.0;
  const trunkR = 0.28;

  // Collider sits on the ground (center at half height)
  const trunkPhys = physicsWorld.createStaticBox(
    x,
    trunkH / 2,
    z,
    trunkR,
    trunkH / 2,
    trunkR
  );

  const group = new THREE.Group();
  // Group origin on the floor
  group.position.set(x, 0, z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.55, 0.32),
    roughness: 0.85,
  });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.5 - i * 0.35, 1.7 - i * 0.15, 8),
      leafMat
    );
    cone.position.y = trunkH * 0.55 + i * 0.85 + 0.9;
    cone.castShadow = true;
    group.add(cone);
  }

  // Leaf volume collider (approximate) so bullets hit foliage too
  const canopyPhys = physicsWorld.createStaticBox(
    x,
    trunkH + 1.2,
    z,
    1.2,
    1.4,
    1.2
  );

  addToScene(sceneManager, group);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, trunkH / 2, z),
      physics: createPhysics(trunkPhys.body, trunkPhys.collider),
      renderMesh: { mesh: group },
    })
  );
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, trunkH + 1.2, z),
      physics: createPhysics(canopyPhys.body, canopyPhys.collider),
      renderMesh: { mesh: new THREE.Object3D() },
    })
  );
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, x, z, rotY = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: [0x2e86de, 0xee5a24, 0x10ac84, 0xf368e0][Math.floor(Math.random() * 4)],
    metalness: 0.45,
    roughness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  body.receiveShadow = true;
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
  for (const [wx, wy, wz] of [
    [1.1, 0.35, 1.3],
    [-1.1, 0.35, 1.3],
    [1.1, 0.35, -1.3],
    [-1.1, 0.35, -1.3],
  ]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    group.add(w);
  }

  // Physics aligned with visual body center
  const phys = physicsWorld.createStaticBox(x, 0.75, z, 1.15, 0.75, 2.15);

  addToScene(sceneManager, group);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, 0.75, z),
      physics: createPhysics(phys.body, phys.collider),
      renderMesh: { mesh: group },
    })
  );
}

function addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  const { WIDTH, LENGTH } = GAME_CONFIG.MAP_BOUNDS;
  const halfW = WIDTH / 2;
  const halfL = LENGTH / 2;
  const wallH = 12;
  const thick = 2;

  const walls = [
    { x: 0, y: wallH / 2, z: -halfL - thick / 2, sx: WIDTH + thick * 2, sy: wallH, sz: thick },
    { x: 0, y: wallH / 2, z: halfL + thick / 2, sx: WIDTH + thick * 2, sy: wallH, sz: thick },
    { x: -halfW - thick / 2, y: wallH / 2, z: 0, sx: thick, sy: wallH, sz: LENGTH },
    { x: halfW + thick / 2, y: wallH / 2, z: 0, sx: thick, sy: wallH, sz: LENGTH },
  ];

  for (const w of walls) {
    const phys = physicsWorld.createStaticBox(w.x, w.y, w.z, w.sx / 2, w.sy / 2, w.sz / 2);
    // Invisible — block only
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w.sx, w.sy, w.sz),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    mesh.position.set(w.x, w.y, w.z);
    addToScene(sceneManager, mesh);
    mapEntities.push(
      ecsWorld.add({
        isMap: true,
        isBoundary: true,
        transform: createTransform(w.x, w.y, w.z),
        physics: createPhysics(phys.body, phys.collider),
        renderMesh: { mesh },
      })
    );
  }
}

function addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, x, z, radius, height) {
  // Visual cone sitting on the floor
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 6),
    new THREE.MeshStandardMaterial({
      color: 0x5a8f4a,
      roughness: 1,
      flatShading: true,
    })
  );
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addToScene(sceneManager, mesh);

  // Stacked box colliders approximating the cone so bullets & players collide
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const y = height * (t + 0.5 / layers);
    const r = radius * (1 - t) * 0.85;
    const phys = physicsWorld.createStaticBox(x, y, z, r, height / layers / 2, r);
    mapEntities.push(
      ecsWorld.add({
        isMap: true,
        transform: createTransform(x, y, z),
        physics: createPhysics(phys.body, phys.collider),
        renderMesh: { mesh: i === 0 ? mesh : new THREE.Object3D() },
      })
    );
  }
}

export function createMap(ecsWorld, physicsWorld, sceneManager) {
  const mapEntities = [];
  const { WIDTH, LENGTH } = GAME_CONFIG.MAP_BOUNDS;

  // Floor at y=0 top surface (box center -0.1, height 0.2)
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

  // Paths on top of floor
  for (const [px, pz, sx, sz] of [
    [0, 0, 6, 40],
    [0, 0, 40, 6],
  ]) {
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(sx, 0.04, sz),
      new THREE.MeshStandardMaterial({ color: 0xc2a87c, roughness: 1 })
    );
    path.position.set(px, 0.02, pz);
    path.receiveShadow = true;
    addToScene(sceneManager, path);
  }

  // Invisible outer walls — no falling off the map
  addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities);

  const crates = [
    { x: -12, y: 1, z: -8, sx: 3, sy: 2, sz: 3, color: 0xb8956c },
    { x: 12, y: 1, z: 8, sx: 3, sy: 2, sz: 3, color: 0xa67c52 },
    { x: -8, y: 1.25, z: 12, sx: 2.5, sy: 2.5, sz: 5, color: 0x7f8c8d },
    { x: 10, y: 1.25, z: -12, sx: 5, sy: 2.5, sz: 2.5, color: 0x7f8c8d },
    { x: 0, y: 1, z: 0, sx: 4, sy: 2, sz: 4, color: 0x95a5a6 },
    { x: -18, y: 0.6, z: 0, sx: 2, sy: 1.2, sz: 2, color: 0xd35400 },
    { x: 18, y: 0.6, z: 0, sx: 2, sy: 1.2, sz: 2, color: 0x2980b9 },
  ];
  for (const c of crates) addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, c);

  // Trees on the floor inside bounds
  const treePositions = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    treePositions.push([
      Math.cos(a) * 30,
      Math.sin(a) * 30,
    ]);
  }
  treePositions.push([-6, -18], [8, 20], [-22, 10], [20, -15], [14, 14], [-15, -12]);
  for (const [tx, tz] of treePositions) {
    if (Math.abs(tx) > WIDTH / 2 - 3 || Math.abs(tz) > LENGTH / 2 - 3) continue;
    addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, tx, tz);
  }

  addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, -5, 14, 0.4);
  addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, 8, -16, -0.8);
  addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, 16, 6, 1.2);

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

  // Mountains near edge with real colliders
  const mountains = [
    [32, 28, 10, 8],
    [-30, 30, 12, 9],
    [28, -32, 11, 7],
    [-32, -28, 9, 8],
  ];
  for (const [mx, mz, r, h] of mountains) {
    addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, mx, mz, r, h);
  }

  return mapEntities;
}
