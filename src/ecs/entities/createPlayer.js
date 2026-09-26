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
 * network status, weapon state, input tracking, and Three.js visual mesh.
 * 
 * @param {object} ecsWorld - The Miniplex ECS world instance.
 * @param {object} physicsWorld - Wrapper class for Rapier3D.
 * @param {object|THREE.Scene} sceneOrManager - SceneManager instance or direct THREE.Scene instance.
 * @param {string|number} playerId - Unique player identifier or WebRTC Peer ID.
 * @param {{x: number, y: number, z: number}} [spawnPos={x: 0, y: 2, z: 0}] - Initial spawn position.
 * @param {boolean} [isLocal=false] - True if this represents the local player instance.
 * @param {boolean} [isHost=false] - True if running as host.
 * @returns {object} The created Miniplex player entity object.
 */
export function createPlayer(
  ecsWorld,
  physicsWorld,
  sceneOrManager,
  playerId,
  spawnPos = { x: 0, y: 2, z: 0 },
  isLocal = false,
  isHost = false
) {
  // Resolve scene object depending on whether sceneManager or raw THREE.Scene was passed
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

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

  // Hide mesh visually for local FPS camera, keep active in scene tree
  if (isLocal) {
    mesh.visible = false;
  }

  if (scene && typeof scene.add === 'function') {
    scene.add(mesh);
  }

  // 3. Instantiate Components & Register Entity in Miniplex ECS
  const peerId = typeof playerId === 'string' ? playerId : '';
  const numericId = typeof playerId === 'number' ? playerId : 1;

  const playerEntity = ecsWorld.add({
    player: createPlayerComponent(numericId, peerId, isLocal, isHost, GAME_CONFIG.MAX_HEALTH),
    transform: createTransform(spawnPos.x, spawnPos.y, spawnPos.z),
    physics: createPhysics(phys.body, phys.collider, phys.controller),
    weapon: createWeapon(),
    input: createInput(),
    renderMesh: { mesh },
  });

  return playerEntity;
}