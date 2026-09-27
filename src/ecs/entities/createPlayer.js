// src/ecs/entities/createPlayer.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { createPlayer as createPlayerComponent } from '../components/Player.js';
import { createWeapon, createLoadout } from '../components/Weapon.js';
import { createInput } from '../components/Input.js';
import { GAME_CONFIG, peerIdToNumeric } from '../../config/constants.js';
import { WORLD_CONFIG } from '../../config/world.js';

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

  const groundedY = spawnPos.y ?? (
    WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2
  );

  const phys = physicsWorld.createPlayerBody(
    spawnPos.x,
    groundedY,
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
  mesh.position.set(spawnPos.x, groundedY, spawnPos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (isLocal) mesh.visible = false;
  if (scene?.add) scene.add(mesh);

  const peerId = typeof playerId === 'string' ? playerId : String(playerId ?? '');
  const numericId = peerIdToNumeric(playerId);

  const loadout = createLoadout();

  const activeWeapon = loadout.slots[0];

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
    weapon: activeWeapon,
    loadout,
    input: createInput(),
    renderMesh: { mesh },
  });

  if (physicsWorld?.registerColliderEntity) {
    physicsWorld.registerColliderEntity(phys.collider, playerEntity);
  }

  return playerEntity;
}
