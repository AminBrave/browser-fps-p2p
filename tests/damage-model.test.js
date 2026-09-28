import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDamageMultiplier,
  getHitZoneMultiplier,
  calculateShotDamage,
} from '../src/game/simulation/combat/DamageModel.js';

const weapon = {
  damage: 40,
  range: 100,
  damageFalloffStart: 20,
  damageFalloffEnd: 80,
  minDamageMultiplier: 0.5,
  damageFalloffCurve: 1,
  penetrationDamageLoss: 0.1,
};

test('damage falloff stays at full damage before the falloff start', () => {
  assert.equal(getDamageMultiplier(weapon, 0), 1);
  assert.equal(getDamageMultiplier(weapon, 20), 1);
});

test('damage falloff reaches the configured minimum at the end', () => {
  assert.equal(getDamageMultiplier(weapon, 80), 0.5);
  assert.equal(getDamageMultiplier(weapon, 120), 0.5);
});

test('damage falloff curve is configurable', () => {
  const linear = getDamageMultiplier(weapon, 50);
  const lateFalloff = getDamageMultiplier({ ...weapon, damageFalloffCurve: 2 }, 50);
  assert.equal(linear, 0.75);
  assert.equal(lateFalloff, 0.875);
});

test('hit zone multipliers are deterministic', () => {
  assert.equal(getHitZoneMultiplier('head'), 2);
  assert.equal(getHitZoneMultiplier('leftArm'), 0.65);
  assert.equal(getHitZoneMultiplier('rightLeg'), 0.65);
  assert.equal(getHitZoneMultiplier('torso'), 1);
  assert.equal(getHitZoneMultiplier(null), 1);
});

test('shot damage combines falloff, hit zone, velocity and penetration', () => {
  const damage = calculateShotDamage({
    weapon,
    distance: 50,
    hitZone: 'head',
    terminalVelocity: 400,
    muzzleVelocity: 500,
    penetrated: 1,
  });

  assert.equal(damage, 21.6);
});

test('terminal velocity cannot increase damage above muzzle velocity', () => {
  const normal = calculateShotDamage({
    weapon,
    distance: 20,
    hitZone: 'torso',
    terminalVelocity: 500,
    muzzleVelocity: 500,
  });
  const overspeed = calculateShotDamage({
    weapon,
    distance: 20,
    hitZone: 'torso',
    terminalVelocity: 1000,
    muzzleVelocity: 500,
  });

  assert.equal(normal, 40);
  assert.equal(overspeed, 40);
});

test('penetration penalty is clamped to the legacy minimum', () => {
  const damage = calculateShotDamage({
    weapon: { ...weapon, penetrationDamageLoss: 1 },
    distance: 20,
    hitZone: 'torso',
    terminalVelocity: 500,
    muzzleVelocity: 500,
    penetrated: 10,
  });

  assert.equal(damage, 4);
});
