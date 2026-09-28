// src/game/player/createPlayer.js
//
// Player composition boundary. Physics/ECS assembly and presentation character
// construction are explicit dependencies of this world-level factory.

import { PLAYER_CONFIG, WORLD_CONFIG, peerIdToNumeric } from '../../config/index.js';
import { createLoadout } from '../../ecs/components/Weapon.js';
import { createPlayerCharacter } from '../../presentation/player/PlayerCharacterView.js';
import { addPlayerEntity } from '../../ecs/entities/PlayerEntityAssembler.js';

export function createPlayer(
  ecsWorld,
  physicsWorld,
  sceneOrManager,
  playerId,
  spawnPos = { ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[0] },
  isLocal = false,
  isHost = false,
  presentationColliderRegistry = null
) {
  const groundedY = spawnPos.y ?? (WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2);
  const playerPhysics = physicsWorld.createPlayerBody(
    spawnPos.x,
    groundedY,
    spawnPos.z,
    PLAYER_CONFIG.RADIUS,
    PLAYER_CONFIG.HEIGHT
  );

  const character = createPlayerCharacter({
    sceneOrManager,
    spawnPos,
    isLocal,
    groundedY,
  });

  const loadout = createLoadout();
  const activeWeapon = { ...loadout.slots[0] };
  character.setWeaponType(activeWeapon?.typeId ?? 1);
  character.updateVisuals({
    health: PLAYER_CONFIG.MAX_HEALTH,
    maxHealth: PLAYER_CONFIG.MAX_HEALTH,
  });

  return addPlayerEntity(ecsWorld, physicsWorld, {
    playerId,
    spawnPos: { ...spawnPos, y: groundedY },
    isLocal,
    isHost,
    playerPhysics,
    character,
    loadout,
    activeWeapon,
    presentationColliderRegistry,
    maxHealth: PLAYER_CONFIG.MAX_HEALTH,
    numericId: peerIdToNumeric(playerId),
  });
}
