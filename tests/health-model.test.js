import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDamageToHealth, calculateHealthRegen } from '../src/game/simulation/combat/HealthModel.js';

test('damage clamps health at zero and reports a kill transition', () => {
  assert.deepEqual(applyDamageToHealth(40, 50), {
    damage: 50,
    previousHealth: 40,
    health: 0,
    killed: true,
  });
});

test('non-positive damage does not create a kill', () => {
  assert.deepEqual(applyDamageToHealth(40, -10), {
    damage: 0,
    previousHealth: 40,
    health: 40,
    killed: false,
  });
});

test('regen respects delay and rate and never exceeds max health', () => {
  assert.equal(calculateHealthRegen({ health: 50, maxHealth: 100, elapsedMs: 1000, delayMs: 3500, ratePerSecond: 12 }), 0);
  assert.equal(calculateHealthRegen({ health: 95, maxHealth: 100, elapsedMs: 4000, delayMs: 3500, ratePerSecond: 12 }), 5);
});
