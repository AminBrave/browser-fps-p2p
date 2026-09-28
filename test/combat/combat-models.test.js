import test from 'node:test';
import assert from 'node:assert/strict';
import { getDamageMultiplier, getHitZoneMultiplier, calculateShotDamage } from '../../src/game/simulation/combat/DamageModel.js';
import { applyDamageToHealth, calculateHealthRegen } from '../../src/game/simulation/combat/HealthModel.js';
import { CombatResolver } from '../../src/game/simulation/combat/CombatResolver.js';
import { sampleShotDirection, sampleDirectionAroundVector } from '../../src/game/simulation/combat/ShotDirection.js';
import { createImpactSeed } from '../../src/game/simulation/combat/ImpactSeed.js';
import { buildShotEvent } from '../../src/game/simulation/combat/ShotEventModel.js';
import { shouldFire, canReload, completeReload } from '../../src/game/simulation/combat/WeaponStateModel.js';
import { FIRE_MODE } from '../../src/config/index.js';

const weapon = {
  damage: 40, range: 100, damageFalloffStart: 10, damageFalloffEnd: 50,
  minDamageMultiplier: 0.5, damageFalloffCurve: 1, muzzleVelocity: 500,
  penetrationDamageLoss: 0.2, fireRateMs: 100, fireMode: FIRE_MODE.AUTO,
};

test('damage falloff reaches expected endpoints', () => {
  assert.equal(getDamageMultiplier(weapon, 0), 1);
  assert.equal(getDamageMultiplier(weapon, 10), 1);
  assert.equal(getDamageMultiplier(weapon, 50), 0.5);
  assert.ok(getDamageMultiplier(weapon, 30) < 1 && getDamageMultiplier(weapon, 30) > 0.5);
});

test('hit zones use documented multipliers', () => {
  assert.equal(getHitZoneMultiplier('head'), 2);
  assert.equal(getHitZoneMultiplier('leftArm'), 0.65);
  assert.equal(getHitZoneMultiplier('body'), 1);
});

test('shot damage combines distance, hit zone, velocity and penetration', () => {
  assert.equal(calculateShotDamage({ weapon, distance: 0, hitZone: 'body', terminalVelocity: 500, muzzleVelocity: 500 }), 40);
  assert.equal(calculateShotDamage({ weapon, distance: 0, hitZone: 'head', terminalVelocity: 500, muzzleVelocity: 500 }), 80);
  assert.equal(calculateShotDamage({ weapon, distance: 0, hitZone: 'body', terminalVelocity: 500, muzzleVelocity: 500, penetrated: 1 }), 32);
});

test('health damage clamps at zero and reports lethal transition', () => {
  assert.deepEqual(applyDamageToHealth(100, 25), { damage: 25, previousHealth: 100, health: 75, killed: false });
  assert.equal(applyDamageToHealth(20, 25).health, 0);
  assert.equal(applyDamageToHealth(20, 25).killed, true);
  assert.equal(applyDamageToHealth(0, 25).killed, false);
});

test('health regeneration respects delay, rate and maximum', () => {
  assert.equal(calculateHealthRegen({ health: 50, maxHealth: 100, elapsedMs: 500, delayMs: 1000, ratePerSecond: 10 }), 0);
  assert.equal(calculateHealthRegen({ health: 50, maxHealth: 100, elapsedMs: 2000, delayMs: 1000, ratePerSecond: 10 }), 20);
  assert.equal(calculateHealthRegen({ health: 95, maxHealth: 100, elapsedMs: 2000, delayMs: 0, ratePerSecond: 10 }), 5);
});

test('combat resolver rejects dead and self targets', () => {
  const resolver = new CombatResolver();
  const target = { player: { id: 2, isDead: false } };
  assert.equal(resolver.resolvePlayerHit({ attackerId: 2, targetEntity: target, weapon, distance: 1, hitZone: 'body', terminalVelocity: 500, muzzleVelocity: 500 }), null);
  assert.equal(resolver.resolvePlayerHit({ attackerId: 1, targetEntity: { player: { id: 2, isDead: true } }, weapon, distance: 1, hitZone: 'body', terminalVelocity: 500, muzzleVelocity: 500 }), null);
  assert.ok(resolver.resolvePlayerHit({ attackerId: 1, targetEntity: target, weapon, distance: 1, hitZone: 'body', terminalVelocity: 500, muzzleVelocity: 500 }).amount > 0);
});

test('shot directions are normalized and zero spread preserves aim', () => {
  const d = sampleShotDirection({ yaw: 0.4, pitch: -0.2, spread: 0 });
  assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-12);
  assert.deepEqual(sampleDirectionAroundVector({ direction: { x: 0, y: 0, z: -2 }, spread: 0 }), { x: 0, y: 0, z: -1 });
});

test('injected shot RNG makes spread deterministic', () => {
  const values = [0.25, 0.36];
  let i = 0;
  const a = sampleShotDirection({ yaw: 0, pitch: 0, spread: 0.1, random: () => values[i++] });
  i = 0;
  const b = sampleShotDirection({ yaw: 0, pitch: 0, spread: 0.1, random: () => values[i++] });
  assert.deepEqual(a, b);
});

test('impact seeds are deterministic and identity-sensitive', () => {
  const args = { shooterId: 'a', weaponId: 1, position: { x: 1, y: 2, z: 3 }, material: 'metal', sequence: 4 };
  assert.equal(createImpactSeed(args), createImpactSeed(args));
  assert.notEqual(createImpactSeed(args), createImpactSeed({ ...args, shooterId: 'b' }));
});

test('shot events preserve authoritative ballistic metadata', () => {
  const event = buildShotEvent({
    shooterId: 'p1', weapon: { ...weapon, typeId: 2, sfx: 'rifle', muzzleVelocity: 600 },
    origin: { x: 0, y: 1, z: 0 }, end: { x: 0, y: 1, z: -10 },
    hit: null, normal: null, direction: { x: 0, y: 0, z: -1 },
    trace: { distance: 10, velocity: 580, impacts: [] }, pelletIndex: 0, material: 'metal',
  });
  assert.equal(event.shooterId, 'p1');
  assert.equal(event.weaponId, 2);
  assert.equal(event.terminalVelocity, 580);
  assert.equal(event.primary, true);
  assert.equal(typeof event.impactSeed, 'number');
});

test('weapon fire and reload rules respect mode, cooldown and ammo', () => {
  const auto = { ...weapon, fireMode: FIRE_MODE.AUTO, isReloading: false, lastFiredTime: 100 };
  assert.equal(shouldFire({ weapon: auto, wantShoot: true, shootPressed: false, now: 199 }), false);
  assert.equal(shouldFire({ weapon: auto, wantShoot: true, shootPressed: false, now: 200 }), true);
  const semi = { ...weapon, fireMode: FIRE_MODE.SEMI, lastFiredTime: 0 };
  assert.equal(shouldFire({ weapon: semi, wantShoot: false, shootPressed: true, now: 200 }), true);
  assert.equal(shouldFire({ weapon: semi, wantShoot: true, shootPressed: false, now: 200 }), false);
  assert.equal(canReload({ magazine: 0, magazineSize: 12, reserveAmmo: 5, isReloading: false }, true, false), true);
  assert.equal(canReload({ magazine: 12, magazineSize: 12, reserveAmmo: 5, isReloading: false }, true, false), false);
  assert.deepEqual(completeReload({ magazine: 8, magazineSize: 12, reserveAmmo: 20 }), { magazine: 12, reserveAmmo: 16, completed: true });
});
