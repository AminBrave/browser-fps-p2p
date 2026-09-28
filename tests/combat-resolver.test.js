import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatResolver } from '../src/game/simulation/combat/CombatResolver.js';

const weapon = {
  damage: 40,
  range: 100,
  damageFalloffStart: 10,
  damageFalloffEnd: 50,
  minDamageMultiplier: 0.5,
  muzzleVelocity: 500,
  penetrationDamageLoss: 0.05,
};

test('resolver creates a damage command for a living enemy', () => {
  const targetEntity = { player: { id: 'target', isDead: false } };
  const resolver = new CombatResolver();

  const result = resolver.resolvePlayerHit({
    attackerId: 'attacker',
    targetEntity,
    weapon,
    distance: 20,
    hitZone: 'head',
    terminalVelocity: 500,
    muzzleVelocity: 500,
  });

  assert.equal(result.targetEntity, targetEntity);
  assert.equal(result.attackerId, 'attacker');
  assert.equal(result.hitZone, 'head');
  assert.equal(result.amount, 70);
});

test('resolver rejects self hits and dead targets', () => {
  const resolver = new CombatResolver();

  assert.equal(
    resolver.resolvePlayerHit({
      attackerId: 'same',
      targetEntity: { player: { id: 'same', isDead: false } },
      weapon,
      distance: 0,
      terminalVelocity: 500,
      muzzleVelocity: 500,
    }),
    null
  );

  assert.equal(
    resolver.resolvePlayerHit({
      attackerId: 'attacker',
      targetEntity: { player: { id: 'dead', isDead: true } },
      weapon,
      distance: 0,
      terminalVelocity: 500,
      muzzleVelocity: 500,
    }),
    null
  );
});

test('resolver rejects invalid computed damage', () => {
  const resolver = new CombatResolver();
  const result = resolver.resolvePlayerHit({
    attackerId: 'attacker',
    targetEntity: { player: { id: 'target', isDead: false } },
    weapon: { damage: NaN },
    distance: 0,
    terminalVelocity: 500,
    muzzleVelocity: 500,
  });

  assert.equal(result, null);
});
