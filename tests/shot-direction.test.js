import test from 'node:test';
import assert from 'node:assert/strict';

import { sampleShotDirection } from '../src/game/simulation/combat/ShotDirection.js';

test('zero spread produces the exact aim direction', () => {
  const direction = sampleShotDirection({
    yaw: 0,
    pitch: 0,
    spread: 0,
    random: () => {
      throw new Error('RNG must not be consumed when spread is zero');
    },
  });

  assert.deepEqual(direction, { x: -0, y: 0, z: -1 });
});

test('direction is normalized', () => {
  const direction = sampleShotDirection({
    yaw: 0.7,
    pitch: -0.35,
    spread: 0.08,
    random: () => 0.5,
  });

  assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-12);
});

test('spread sampling is deterministic with an injected RNG', () => {
  const values = [0.25, 0.81];
  let index = 0;
  const random = () => values[index++];

  const first = sampleShotDirection({
    yaw: 0.2,
    pitch: -0.1,
    spread: 0.04,
    random,
  });

  index = 0;
  const second = sampleShotDirection({
    yaw: 0.2,
    pitch: -0.1,
    spread: 0.04,
    random,
  });

  assert.deepEqual(first, second);
  assert.equal(index, 2);
});

test('zero spread does not consume RNG', () => {
  let calls = 0;
  sampleShotDirection({
    yaw: 1,
    pitch: 0.2,
    spread: 0,
    random: () => {
      calls += 1;
      return 0.5;
    },
  });

  assert.equal(calls, 0);
});
