import test from 'node:test';
import assert from 'node:assert/strict';

import { getAccuracyState } from '../src/utils/AccuracyModel.js';

test('accuracy state is deterministic for identical inputs', () => {
  const input = {
    stance: 0,
    speed: 4,
    maxSpeed: 10.8,
    isAiming: false,
    isSprinting: false,
    steadySpread: 0.003,
    baseSpread: 0.004,
    bloom: 0.01,
    spreadMax: 0.05,
    moveSpreadMax: 0.035,
  };

  assert.deepEqual(getAccuracyState(input), getAccuracyState(input));
});

test('ADS reduces static and movement spread when not sprinting', () => {
  const base = getAccuracyState({
    speed: 4,
    maxSpeed: 10.8,
    isAiming: false,
    steadySpread: 0.003,
    baseSpread: 0.004,
    bloom: 0.01,
    spreadMax: 0.05,
    moveSpreadMax: 0.035,
  });

  const ads = getAccuracyState({
    speed: 4,
    maxSpeed: 10.8,
    isAiming: true,
    steadySpread: 0.003,
    baseSpread: 0.004,
    bloom: 0.01,
    spreadMax: 0.05,
    moveSpreadMax: 0.035,
  });

  assert.ok(ads.effectiveSpread < base.effectiveSpread);
  assert.ok(ads.movementSpread > 0);
  assert.ok(ads.movementMultiplier < 1);
});

test('sprinting adds its configured spread penalty', () => {
  const walking = getAccuracyState({
    speed: 0,
    isSprinting: false,
    steadySpread: 0.003,
    baseSpread: 0,
    bloom: 0,
    spreadMax: 0.05,
    moveSpreadMax: 0.035,
  });

  const sprinting = getAccuracyState({
    speed: 0,
    isSprinting: true,
    steadySpread: 0.003,
    baseSpread: 0,
    bloom: 0,
    spreadMax: 0.05,
    moveSpreadMax: 0.035,
  });

  assert.ok(sprinting.sprintSpread > 0);
  assert.equal(
    sprinting.rawSpread - walking.rawSpread,
    sprinting.sprintSpread
  );
});

test('effective spread is bounded by the configured maximum plus sprint penalty', () => {
  const state = getAccuracyState({
    speed: 1000,
    maxSpeed: 1,
    isSprinting: true,
    steadySpread: 1,
    baseSpread: 1,
    bloom: 1,
    spreadMax: 0.05,
    moveSpreadMax: 1,
  });

  assert.ok(state.effectiveSpread <= 0.05 + state.sprintSpread);
  assert.ok(state.rawSpread >= state.effectiveSpread);
});
