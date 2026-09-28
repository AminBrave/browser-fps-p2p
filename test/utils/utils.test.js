import test from 'node:test';
import assert from 'node:assert/strict';
import { setFlag, clearFlag, hasFlag, toggleFlag } from '../../src/utils/BitFlags.js';
import { CircularBuffer } from '../../src/utils/CircularBuffer.js';
import { getAccuracyState } from '../../src/utils/AccuracyModel.js';

test('bit flags set, clear, query and toggle independently', () => {
  let mask = setFlag(setFlag(0, 1), 4);
  assert.equal(hasFlag(mask, 1), true);
  assert.equal(hasFlag(mask, 2), false);
  mask = clearFlag(mask, 1);
  assert.equal(mask, 4);
  assert.equal(toggleFlag(mask, 4), 0);
});

test('circular buffer overwrites the oldest entry at capacity', () => {
  const buffer = new CircularBuffer(3);
  buffer.push('a'); buffer.push('b'); buffer.push('c'); buffer.push('d');
  assert.equal(buffer.peek(), 'b');
  assert.deepEqual(buffer.toArray(), ['b', 'c', 'd']);
  assert.equal(buffer.get(0), 'd');
  assert.equal(buffer.get(2), 'b');
  assert.equal(buffer.shift(), 'b');
});

test('circular buffer discardUpTo removes only the matching oldest prefix', () => {
  const buffer = new CircularBuffer(4);
  [1, 2, 3, 4].forEach((x) => buffer.push(x));
  buffer.discardUpTo((x) => x < 3);
  assert.deepEqual(buffer.toArray(), [3, 4]);
  buffer.discardUpTo((x) => x <= 3);
  assert.deepEqual(buffer.toArray(), [4]);
});

test('accuracy model tightens ADS and increases movement/sprint spread', () => {
  const idle = getAccuracyState({ speed: 0, isAiming: false, isSprinting: false });
  const moving = getAccuracyState({ speed: 10, isAiming: false, isSprinting: false });
  const ads = getAccuracyState({ speed: 0, isAiming: true, isSprinting: false });
  const sprint = getAccuracyState({ speed: 10, isAiming: false, isSprinting: true });
  assert.ok(moving.effectiveSpread > idle.effectiveSpread);
  assert.ok(ads.effectiveSpread < idle.effectiveSpread);
  assert.ok(sprint.effectiveSpread > moving.effectiveSpread);
});

test('accuracy model keeps sprint penalty while aiming', () => {
  const a = getAccuracyState({ speed: 10, isAiming: true, isSprinting: true });
  const b = getAccuracyState({ speed: 10, isAiming: false, isSprinting: true });
  assert.equal(a.effectiveSpread, b.effectiveSpread);
});
