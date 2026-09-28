import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationEffectStore } from '../src/presentation/effects/PresentationEffectStore.js';

test('presentation effects have an independent bounded lifecycle', () => {
  const store = new PresentationEffectStore();
  let disposed = 0;
  let updates = 0;

  const effect = store.add({
    durationMs: 100,
    update: () => { updates++; },
    dispose: () => { disposed++; },
  });

  assert.equal(store.size, 1);
  store.update(0.016, effect.createdAt + 50);
  assert.equal(store.size, 1);
  assert.equal(updates, 1);

  store.update(0.016, effect.createdAt + 101);
  assert.equal(store.size, 0);
  assert.equal(disposed, 1);
});

test('manual removal disposes exactly once', () => {
  const store = new PresentationEffectStore();
  let disposed = 0;
  const effect = store.add({ dispose: () => { disposed++; } });

  assert.equal(store.remove(effect), true);
  assert.equal(store.remove(effect), false);
  assert.equal(disposed, 1);
  assert.equal(store.size, 0);
});

test('clearing the store disposes all active effects', () => {
  const store = new PresentationEffectStore();
  let disposed = 0;
  store.add({ dispose: () => { disposed++; } });
  store.add({ dispose: () => { disposed++; } });

  store.clear();

  assert.equal(store.size, 0);
  assert.equal(disposed, 2);
});
