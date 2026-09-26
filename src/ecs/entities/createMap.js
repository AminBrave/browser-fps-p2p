// src/ecs/entities/createMap.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { GAME_CONFIG } from '../../config/constants.js';

/** Floor top surface is y = 0 */
const GROUND_Y = 0;

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

/** Tree: trunk bottom on GROUND_Y */
function addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, x, z) {
  const trunkH = 2.6;
  const trunkR = 0.28;

  const group = new THREE.Group();
  group.position.set(x, GROUND_Y, z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.75, trunkR, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.92 })
  );
  // Cylinder centered at origin of mesh → lift so bottom is at y=0
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.30, 0.5, 0.3),
    roughness: 0.9,
  });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.45 - i * 0.32, 1.6, 8),
      leafMat
    );
    cone.position.y = trunkH * 0.5 + 0.7 + i * 0.85;
    cone.castShadow = true;
    group.add(cone);
  }

  // Colliders centered correctly on trunk / canopy
  const trunkPhys = physicsWorld.createStaticBox(
    x, trunkH / 2, z, trunkR, trunkH / 2, trunkR
  );
  const canopyPhys = physicsWorld.createStaticBox(
    x, trunkH + 1.0, z, 1.15, 1.3, 1.15
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
      transform: createTransform(x, trunkH + 1.0, z),
      physics: createPhysics(canopyPhys.body, canopyPhys.collider),
      renderMesh: { mesh: new THREE.Object3D() },
    })
  );
}

/** Car: wheels rest on GROUND_Y */
function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, x, z, rotY = 0) {
  const wheelR = 0.32;
  const group = new THREE.Group();
  group.position.set(x, GROUND_Y, z);
  group.rotation.y = rotY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: [0x2e86de, 0xee5a24, 0x10ac84, 0x8854d0][(Math.abs(Math.floor(x + z)) % 4)],
    metalness: 0.5,
    roughness: 0.35,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 3.8), bodyMat);
  body.position.y = wheelR + 0.35;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.25, roughness: 0.4 })
  );
  cabin.position.set(0, wheelR + 0.85, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 14);
  for (const [wx, wz] of [
    [0.95, 1.2],
    [-0.95, 1.2],
    [0.95, -1.2],
    [-0.95, -1.2],
  ]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    // Wheel center at wheelR above ground
    w.position.set(wx, wheelR, wz);
    group.add(w);
  }

  const bodyCenterY = wheelR + 0.45;
  const phys = physicsWorld.createStaticBox(x, bodyCenterY, z, 1.05, 0.55, 1.95);

  addToScene(sceneManager, group);
  mapEntities.push(
    ecsWorld.add({
      isMap: true,
      transform: createTransform(x, bodyCenterY, z),
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
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 6),
    new THREE.MeshStandardMaterial({ color: 0x4e7a42, roughness: 1, flatShading: true })
  );
  // Cone default: base at -height/2 relative to center → place center so base on ground
  mesh.position.set(x, GROUND_Y + height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addToScene(sceneManager, mesh);

  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = (i + 0.5) / layers;
    const y = GROUND_Y + height * t;
    const r = radius * (1 - t) * 0.9;
    const phys = physicsWorld.createStaticBox(x, y, z, Math.max(0.5, r), height / layers / 2, Math.max(0.5, r));
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

  // Floor: top face at y=0
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

  for (const [px, pz, sx, sz] of [
    [0, 0, 6, 40],
    [0, 0, 40, 6],
  ]) {
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(sx, 0.03, sz),
      new THREE.MeshStandardMaterial({ color: 0xc2a87c, roughness: 1 })
    );
    path.position.set(px, 0.015, pz);
    path.receiveShadow = true;
    addToScene(sceneManager, path);
  }

  addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities);

  // Crates: bottom on ground → center y = sy/2
  const crates = [
    { x: -12, z: -8, sx: 3, sy: 2, sz: 3, color: 0xb8956c },
    { x: 12, z: 8, sx: 3, sy: 2, sz: 3, color: 0xa67c52 },
    { x: -8, z: 12, sx: 2.5, sy: 2.5, sz: 5, color: 0x7f8c8d },
    { x: 10, z: -12, sx: 5, sy: 2.5, sz: 2.5, color: 0x7f8c8d },
    { x: 0, z: 0, sx: 4, sy: 2, sz: 4, color: 0x95a5a6 },
    { x: -18, z: 0, sx: 2, sy: 1.2, sz: 2, color: 0xd35400 },
    { x: 18, z: 0, sx: 2, sy: 1.2, sz: 2, color: 0x2980b9 },
  ];
  for (const c of crates) {
    addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
      ...c,
      y: c.sy / 2,
    });
  }

  const treePositions = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    treePositions.push([Math.cos(a) * 30, Math.sin(a) * 30]);
  }
  treePositions.push([-6, -18], [8, 20], [-22, 10], [20, -15], [14, 14], [-15, -12]);
  for (const [tx, tz] of treePositions) {
    if (Math.abs(tx) > WIDTH / 2 - 4 || Math.abs(tz) > LENGTH / 2 - 4) continue;
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

  for (const [mx, mz, r, h] of [
    [32, 28, 10, 8],
    [-30, 30, 12, 9],
    [28, -32, 11, 7],
    [-32, -28, 9, 8],
  ]) {
    addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, mx, mz, r, h);
  }

  return mapEntities;
}
