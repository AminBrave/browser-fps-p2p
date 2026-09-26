// src/ecs/entities/createPlayer.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { createPlayer as createPlayerComponent } from '../components/Player.js';
import { createWeapon } from '../components/Weapon.js';
import { createInput } from '../components/Input.js';
import { GAME_CONFIG } from '../../config/constants.js';

/**
 * Entity Assembler: Player
 * Assembles a player entity with transform, physics kinematic controller,
 * network status, weapon state, input tracking, and three.js visual mesh.
 * 
 * @param {object} ecsWorld - The ECS world instance.
 * @param {object} physicsWorld - Wrapper class for Rapier3D.
 * @param {object} sceneManager - Wrapper class for Three.js scene management.
 * @param {number} playerId - Unique numeric player index (1-4).
 * @param {string} peerId - WebRTC Peer ID associated with this client.
 * @param {boolean} isLocal - True if this represents the local player instance.
 * @param {boolean} isHost - True if running as host.
 * @param {{x: number, y: number, z: number}} spawnPos - Initial spawn position.
 * @returns {number} The created player entity ID.
 */
export function createPlayer(
  ecsWorld,
  physicsWorld,
  sceneManager,
  playerId,
  peerId,
  isLocal = false,
  isHost = false,
  spawnPos = { x: 0, y: 2, z: 0 }
) {
  const entityId = ecsWorld.createEntity();

  // 1. Create Rapier3D Kinematic Physics Capsule
  const phys = physicsWorld.createPlayerBody(
    spawnPos.x,
    spawnPos.y,
    spawnPos.z,
    GAME_CONFIG.PLAYER_RADIUS,
    GAME_CONFIG.PLAYER_HEIGHT
  );

  // 2. Create Three.js Visual Representation
  // Simple capsule representation with color variation based on local vs remote
  const geometry = new THREE.CapsuleGeometry(
    GAME_CONFIG.PLAYER_RADIUS,
    GAME_CONFIG.PLAYER_HEIGHT - GAME_CONFIG.PLAYER_RADIUS * 2,
    8,
    16
  );

  // Local player is blue, remote players are red
  const color = isLocal ? 0x0088ff : 0xff3333;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Local player body is hidden visually for the local camera, but kept in scene graph
  if (isLocal) {
    mesh.visible = false;
  }

  sceneManager.add(mesh);

  // 3. Attach ECS Components
  ecsWorld.addComponent(entityId, 'Transform', createTransform(spawnPos.x, spawnPos.y, spawnPos.z));
  ecsWorld.addComponent(entityId, 'Physics', createPhysics(phys.body, phys.collider, phys.controller));
  ecsWorld.addComponent(entityId, 'Player', createPlayerComponent(playerId, peerId, isLocal, isHost, GAME_CONFIG.MAX_HEALTH));
  ecsWorld.addComponent(entityId, 'Weapon', createWeapon());
  ecsWorld.addComponent(entityId, 'Input', createInput());
  ecsWorld.addComponent(entityId, 'RenderMesh', { mesh });

  return entityId;
}