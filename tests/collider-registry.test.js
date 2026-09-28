import test from 'node:test';
import assert from 'node:assert/strict';
import { ColliderRegistry } from '../src/physics/ColliderRegistry.js';

function collider(handle) {
  return { handle };
}

test('collider registry stores and resolves gameplay metadata', () => {
  const registry = new ColliderRegistry();
  const c = collider(17);
  const entity = { id: 4, player: {} };
  registry.register(c, entity, 'head', 'metal');

  assert.equal(registry.getEntity(c), entity);
  assert.equal(registry.getHitZone(c), 'head');
  assert.equal(registry.getMaterial(c), 'metal');
  assert.equal(registry.isPlayerMovementCollider(c), false);
});

test('movement player colliders are identified without gameplay-side maps', () => {
  const registry = new ColliderRegistry();
  const c = collider(8);
  registry.register(c, { player: { isDead: false } });

  assert.equal(registry.isPlayerMovementCollider(c), true);
  assert.equal(registry.getMaterial(c), 'default');

  registry.register(c, { player: {} }, null, 'torso', 'concrete');
  assert.equal(registry.isPlayerMovementCollider(c), false);
});

test('unregister and clear remove all metadata', () => {
  const registry = new ColliderRegistry();
  const c = collider(3);
  registry.register(c, { id: 1 }, 'torso', 'wood');

  registry.unregister(c);
  assert.equal(registry.getEntity(c), null);
    assert.equal(registry.getHitZone(c), null);
  assert.equal(registry.getMaterial(c), 'default');

  registry.register(c, { id: 2 });
  registry.clear();
  assert.equal(registry.getEntity(c), null);
});
