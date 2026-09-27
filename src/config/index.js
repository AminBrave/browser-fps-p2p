// src/config/index.js
// Public configuration surface. Domain files remain separate so each concern
// has one owner, while gameplay systems import from this stable barrel.

export {
  NETWORK_CONFIG,
  GAME_CONFIG,
  INPUT_FLAGS,
  FIRE_MODE,
  STANCE,
  WEAPON_CONFIG,
  WEAPON_LOADOUT,
  DEFAULT_WEAPON,
  peerIdToNumeric,
} from './constants.js';

export { WORLD_CONFIG } from './world.js';

export {
  generateObjectPlacements,
  OBJECT_PLACEMENT_ALGORITHMS,
} from './objectPlacement.js';
