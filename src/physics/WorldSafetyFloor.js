import { WORLD_CONFIG } from '../config/index.js';

/**
 * World-level safety geometry built through the static physics boundary.
 */
export function createWorldSafetyFloor(staticPhysics) {
  const { WIDTH, LENGTH } = WORLD_CONFIG.MAP;
  const { Y, THICKNESS } = WORLD_CONFIG.MAP.SAFETY_FLOOR;
  return staticPhysics.createStaticBox(
    0,
    Y - THICKNESS / 2,
    0,
    WIDTH / 2,
    THICKNESS / 2,
    LENGTH / 2
  );
}