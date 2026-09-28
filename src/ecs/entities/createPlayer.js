// src/ecs/entities/createPlayer.js

import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { createPlayer as createPlayerComponent } from '../components/Player.js';
import { createWeapon, createLoadout } from '../components/Weapon.js';
import { createInput } from '../components/Input.js';
import { PLAYER_CONFIG, peerIdToNumeric } from '../../config/index.js';
import { WORLD_CONFIG } from '../../config/index.js';
import { createPlayerCharacter } from '../../presentation/player/PlayerCharacterView.js';

export function createPlayer(
  ecsWorld,
  physicsWorld,
  sceneOrManager,
  playerId,
  spawnPos = { ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[0] },
  isLocal = false,
  isHost = false
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const groundedY = spawnPos.y ?? (WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2);

  const phys = physicsWorld.createPlayerBody(
    spawnPos.x,
    groundedY,
    spawnPos.z,
    PLAYER_CONFIG.RADIUS,
    PLAYER_CONFIG.HEIGHT
  );

  const character = createPlayerCharacter({
    scene,
    spawnPos,
    isLocal,
    groundedY,
  });

  const peerId = typeof playerId === 'string' ? playerId : String(playerId ?? '');
  const numericId = peerIdToNumeric(playerId);
  const loadout = createLoadout();
  const activeWeapon = { ...loadout.slots[0] };

  const playerEntity = ecsWorld.add({
    player: createPlayerComponent(
      numericId,
      peerId,
      isLocal,
      isHost,
      PLAYER_CONFIG.MAX_HEALTH
    ),
    transform: createTransform(spawnPos.x, groundedY, spawnPos.z),
    physics: {
      ...createPhysics(phys.body, phys.collider, phys.controller),
      colliders: phys.colliders,
      hitZones: phys.hitZones,
    },
    weapon: activeWeapon,
    loadout,
    input: createInput(),
    character,
    renderMesh: { mesh },
  });

  character.setWeaponType(activeWeapon?.typeId ?? 1);
  character.updateVisuals({
    health: PLAYER_CONFIG.MAX_HEALTH,
    maxHealth: PLAYER_CONFIG.MAX_HEALTH,
  });

  const targetByZone = {
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
  };
  for (let i = 0; i < phys.colliders.length; i++) {
    const zone = phys.hitZones[i];
    physicsWorld.registerColliderEntity(
      phys.colliders[i],
      playerEntity,
      targetByZone[zone] || torso,
      zone
    );
  }

  return playerEntity;
}
