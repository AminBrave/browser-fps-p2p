import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldSafetyFloor } from '../../src/physics/WorldSafetyFloor.js';
import { WORLD_CONFIG } from '../../src/config/index.js';

test('world safety floor delegates map dimensions and configured floor geometry', () => {
  let args = null;
  const staticPhysics = {
    createStaticBox(...values) {
      args = values;
      return { handle: 1 };
    },
  };
  const result = createWorldSafetyFloor(staticPhysics);
  const { WIDTH, LENGTH } = WORLD_CONFIG.MAP;
  const { Y, THICKNESS } = WORLD_CONFIG.MAP.SAFETY_FLOOR;
  assert.deepEqual(args, [0, Y - THICKNESS / 2, 0, WIDTH / 2, THICKNESS / 2, LENGTH / 2]);
  assert.deepEqual(result, { handle: 1 });
});
