import test from 'node:test';
import assert from 'node:assert/strict';
import { canReload, completeReload, shouldFire } from '../src/game/simulation/combat/WeaponStateModel.js';

test('semi-auto only fires on the press edge after cooldown', () => {
  const weapon = { fireMode: 'semi', fireRateMs: 200, lastFiredTime: 100 };
  assert.equal(shouldFire({ weapon, wantShoot: true, shootPressed: false, now: 400 }), false);
  assert.equal(shouldFire({ weapon, wantShoot: true, shootPressed: true, now: 400 }), true);
});

test('reload requires missing magazine capacity and reserve ammo', () => {
  const weapon = { magazine: 5, magazineSize: 12, reserveAmmo: 20, isReloading: false };
  assert.equal(canReload(weapon, true, false), true);
  assert.equal(canReload({ ...weapon, magazine: 12 }, true, false), false);
  assert.equal(canReload({ ...weapon, reserveAmmo: 0 }, true, false), false);
});

test('reload completion transfers only the required ammo', () => {
  assert.deepEqual(completeReload({ magazine: 10, magazineSize: 12, reserveAmmo: 50 }), {
    magazine: 12, reserveAmmo: 48, completed: true,
  });
});
