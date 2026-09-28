import test from 'node:test';
import assert from 'node:assert/strict';
import { URBAN_PROP_LIBRARY } from '../src/game/world/UrbanPropDefinitions.js';

const MATERIAL_KEYS = new Set([
  'concrete',
  'darkConcrete',
  'metal',
  'galvanized',
  'painted',
  'yellow',
  'wood',
  'rubber',
  'glass',
  'red',
]);

test('urban prop definitions are rendering-independent data', () => {
  assert.ok(URBAN_PROP_LIBRARY.length > 0);

  for (const spec of URBAN_PROP_LIBRARY) {
    assert.equal(typeof spec.type, 'string');
    assert.equal(typeof spec.name, 'string');
    assert.ok(Array.isArray(spec.parts));

    for (const part of spec.parts) {
      assert.equal(typeof part.kind, 'string');
      assert.equal(typeof part.name, 'string');
      assert.equal(typeof part.material, 'string');
      assert.ok(MATERIAL_KEYS.has(part.material), 'unknown material: ' + part.material);
    }
  }
});
