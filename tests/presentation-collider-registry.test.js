import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationColliderRegistry } from '../src/presentation/world/PresentationColliderRegistry.js';

test('presentation collider registry uses stable collider handles', () => {
  const registry = new PresentationColliderRegistry();
  const collider = { handle: 42 };
  const mesh = { name: 'impact-target' };

  registry.register(collider, mesh);
  assert.equal(registry.getTarget(collider), mesh);
  assert.equal(registry.getTarget({ handle: 42 }), mesh);

  registry.unregister({ handle: 42 });
  assert.equal(registry.getTarget(collider), null);
});

test('presentation collider registry clears bindings', () => {
  const registry = new PresentationColliderRegistry();
  registry.register({ handle: 1 }, {});
  registry.register({ handle: 2 }, {});
  registry.clear();
  assert.equal(registry.getTarget({ handle: 1 }), null);
  assert.equal(registry.getTarget({ handle: 2 }), null);
});
