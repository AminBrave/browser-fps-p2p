import test from 'node:test';
import assert from 'node:assert/strict';
import { ColliderRegistry } from '../../src/physics/ColliderRegistry.js';
import { SpawnSafety } from '../../src/physics/SpawnSafety.js';
import { WORLD_CONFIG } from '../../src/config/index.js';

test('collider registry stores and removes gameplay metadata by stable handle', () => {
  const registry = new ColliderRegistry();
  const collider = { handle: 42 };
  const entity = { player: { id: 7 } };
  registry.register(collider, entity, 'head', 'metal');
  assert.equal(registry.getEntity(collider), entity);
  assert.equal(registry.getHitZone(collider), 'head');
  assert.equal(registry.getMaterial(collider), 'metal');
  assert.equal(registry.isPlayerMovementCollider(collider), false);
  registry.unregister(collider);
  assert.equal(registry.getEntity(collider), null);
  assert.equal(registry.getMaterial(collider), 'default');
});

test('collider registry distinguishes player movement colliders from hit zones', () => {
  const registry = new ColliderRegistry();
  const collider = { handle: 1 };
  registry.register(collider, { player: { id: 1 } });
  assert.equal(registry.isPlayerMovementCollider(collider), true);
  registry.clear();
  assert.equal(registry.getEntity(collider), null);
});

test('spawn safety rejects positions outside map bounds', () => {
  const safety = new SpawnSafety({ castRay: () => ({}) });
  assert.equal(safety.isSafe({ x: WORLD_CONFIG.MAP.WIDTH, y: 1, z: 0 }), false);
});

test('spawn safety rejects overlapping living players', () => {
  const player = { player: { isDead: false }, transform: { position: { x: 0, y: 1, z: 0 } } };
  const safety = new SpawnSafety({
    castRay: (origin, direction) => direction.y < 0 ? {} : null,
    getPlayers: () => [player],
  });
  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }), false);
});

test('spawn safety requires ground support', () => {
  const safety = new SpawnSafety({
    castRay: () => null,
    getPlayers: () => [],
  });
  assert.equal(safety.isSafe({ x: 0, y: 1, z: 0 }), false);
});
