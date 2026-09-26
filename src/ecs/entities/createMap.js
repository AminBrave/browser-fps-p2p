// src/ecs/entities/createMap.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { GAME_CONFIG } from '../../config/constants.js';

/**
 * Entity Assembler: Map
 * Instantiates static geometry colliders in the Rapier physics world 
 * and corresponding Three.js meshes in the graphics scene using Miniplex ECS.
 * 
 * @param {object} ecsWorld - The Miniplex ECS world instance.
 * @param {object} physicsWorld - Wrapper class for Rapier3D.
 * @param {object} sceneManager - Wrapper class for Three.js scene management.
 * @returns {Array<object>} Array of generated entity objects representing map elements.
 */
export function createMap(ecsWorld, physicsWorld, sceneManager) {
  const mapEntities = [];
  const { WIDTH, LENGTH, HEIGHT } = GAME_CONFIG.MAP_BOUNDS;

  // 1. Arena Floor
  const floorSize = { x: WIDTH, y: 0.2, z: LENGTH };
  const floorPos = { x: 0, y: -0.1, z: 0 };

  // Rapier Physics Box
  const floorPhysics = physicsWorld.createStaticBox(
    floorPos.x, floorPos.y, floorPos.z,
    floorSize.x / 2, floorSize.y / 2, floorSize.z / 2
  );

  // Three.js Render Mesh
  const floorGeo = new THREE.BoxGeometry(floorSize.x, floorSize.y, floorSize.z);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(floorPos.x, floorPos.y, floorPos.z);
  floorMesh.receiveShadow = true;

  if (sceneManager && sceneManager.scene) {
    sceneManager.scene.add(floorMesh);
  } else if (sceneManager && typeof sceneManager.add === 'function') {
    sceneManager.add(floorMesh);
  }

  // Create Miniplex Entity
  const floorEntity = ecsWorld.add({
    isMap: true,
    transform: createTransform(floorPos.x, floorPos.y, floorPos.z),
    physics: createPhysics(floorPhysics.body, floorPhysics.collider),
    renderMesh: { mesh: floorMesh },
  });
  mapEntities.push(floorEntity);

  // 2. Perimeter Obstacles / Cover Blocks
  const coverBlocks = [
    { x: -10, y: 1.5, z: -10, sx: 4, sy: 3, sz: 4, color: 0x555555 },
    { x: 10, y: 1.5, z: 10, sx: 4, sy: 3, sz: 4, color: 0x555555 },
    { x: -10, y: 1.5, z: 10, sx: 3, sy: 3, sz: 6, color: 0x444444 },
    { x: 10, y: 1.5, z: -10, sx: 6, sy: 3, sz: 3, color: 0x444444 },
    { x: 0, y: 1.0, z: 0, sx: 5, sy: 2, sz: 5, color: 0x666666 }, // Center cover
  ];

  coverBlocks.forEach((block) => {
    const phys = physicsWorld.createStaticBox(
      block.x, block.y, block.z,
      block.sx / 2, block.sy / 2, block.sz / 2
    );

    const geo = new THREE.BoxGeometry(block.sx, block.sy, block.sz);
    const mat = new THREE.MeshStandardMaterial({ color: block.color, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(block.x, block.y, block.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (sceneManager && sceneManager.scene) {
      sceneManager.scene.add(mesh);
    } else if (sceneManager && typeof sceneManager.add === 'function') {
      sceneManager.add(mesh);
    }

    const blockEntity = ecsWorld.add({
      isMap: true,
      transform: createTransform(block.x, block.y, block.z),
      physics: createPhysics(phys.body, phys.collider),
      renderMesh: { mesh },
    });
    mapEntities.push(blockEntity);
  });

  return mapEntities;
}