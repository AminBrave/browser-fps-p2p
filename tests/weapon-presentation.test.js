import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponPresentation } from '../src/presentation/weapon/WeaponPresentation.js';

test('weapon presentation forwards viewmodel operations', () => {
  const calls = [];
  const presentation = new WeaponPresentation({
    sceneManager: {},
    renderSystem: { weaponViewModel: {
      getMuzzleWorldPosition: () => ({ x: 1, y: 2, z: 3 }),
      onFired: (value) => calls.push(['fired', value]),
      onReloadStart: () => calls.push(['reload']),
      setWeaponType: (id) => calls.push(['weapon', id]),
    } },
  });
  assert.deepEqual(presentation.getMuzzleWorldPosition(), { x: 1, y: 2, z: 3 });
  presentation.onWeaponFired(0.2);
  presentation.onReloadStart();
  presentation.setWeaponType(3);
  assert.deepEqual(calls, [['fired', 0.2], ['reload'], ['weapon', 3]]);
});
