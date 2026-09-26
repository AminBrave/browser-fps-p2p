// src/ecs/entities/createPlayer.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { createPlayer as createPlayerComponent } from '../components/Player.js';
import { createWeapon } from '../components/Weapon.js';
import { createInput } from '../components/Input.js';
import { GAME_CONFIG, peerIdToNumeric } from '../../config/constants.js';

/**
 * Assembles a player entity (physics capsule, mesh, weapon, input).
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
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const phys = physicsWorld.createPlayerBody(
    spawnPos.x,
    spawnPos.y,
    spawnPos.z,
    GAME_CONFIG.PLAYER_RADIUS,
    GAME_CONFIG.PLAYER_HEIGHT
  );

  const geometry = new THREE.CapsuleGeometry(
    GAME_CONFIG.PLAYER_RADIUS,
    GAME_CONFIG.PLAYER_HEIGHT - GAME_CONFIG.PLAYER_RADIUS * 2,
    8,
    16
  );

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
  if (isLocal) mesh.visible = false;

  if (scene && typeof scene.add === 'function') {
    scene.add(mesh);
  }

  const peerId = typeof playerId === 'string' ? playerId : String(playerId ?? '');
  const numericId = peerIdToNumeric(playerId);

  const playerEntity = ecsWorld.add({
    player: createPlayerComponent(
      numericId,
      peerId,
      isLocal,
      isHost,
      GAME_CONFIG.MAX_HEALTH
    ),
    transform: createTransform(spawnPos.x, spawnPos.y, spawnPos.z),
    physics: createPhysics(phys.body, phys.collider, phys.controller),
    weapon: createWeapon(),
    input: createInput(),
    renderMesh: { mesh },
  });

  // Hitscan: map collider → entity
  if (physicsWorld && typeof physicsWorld.registerColliderEntity === 'function') {
    physicsWorld.registerColliderEntity(phys.collider, playerEntity);
  }

  return playerEntity;
}
