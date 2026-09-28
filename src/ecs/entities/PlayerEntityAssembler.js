// src/ecs/entities/PlayerEntityAssembler.js
//
// Simulation/ECS assembly for a player. Presentation objects are supplied by
// the composition layer rather than constructed here.

import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { createPlayer as createPlayerComponent } from '../components/Player.js';
import { createInput } from '../components/Input.js';

export function addPlayerEntity(
  ecsWorld,
  physicsWorld,
  {
    playerId,
    spawnPos,
    isLocal,
    isHost,
    playerPhysics,
    character,
    loadout,
    activeWeapon,
    presentationColliderRegistry = null,
    maxHealth,
    numericId,
  }
) {
  const peerId = typeof playerId === 'string' ? playerId : String(playerId ?? '');
  const playerEntity = ecsWorld.add({
    player: createPlayerComponent(
      numericId,
      peerId,
      isLocal,
      isHost,
      maxHealth
    ),
    transform: createTransform(
      spawnPos.x,
      spawnPos.y,
      spawnPos.z
    ),
    physics: {
      ...createPhysics(
        playerPhysics.body,
        playerPhysics.collider,
        playerPhysics.controller
      ),
      colliders: playerPhysics.colliders,
      hitZones: playerPhysics.hitZones,
    },
    weapon: activeWeapon,
    loadout,
    input: createInput(),
    character,
    renderMesh: { mesh: character.mesh },
  });

  const targetByZone = character.parts;
  for (let i = 0; i < playerPhysics.colliders.length; i++) {
    const collider = playerPhysics.colliders[i];
    const zone = playerPhysics.hitZones[i];
    physicsWorld.registerColliderEntity(collider, playerEntity, zone, 'default');
    const target = targetByZone[zone] || null;
    if (target) presentationColliderRegistry?.register(collider, target);
  }

  return playerEntity;
}
