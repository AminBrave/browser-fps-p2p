import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClientInput, KNOWN_INPUT_MASK, MAX_PITCH } from '../src/network/InputValidator.js';

const valid = {
  sequence: 42,
  inputMask: 1 | 32,
  yaw: Math.PI * 5,
  pitch: 0.2,
  weaponSlot: -1,
  isAiming: true,
};

test('valid input is sanitized and yaw is normalized', () => {
  const result = validateClientInput(valid);

  assert.ok(result);
  assert.equal(result.sequence, 42);
  assert.equal(result.inputMask, 33);
  assert.ok(result.yaw >= -Math.PI && result.yaw <= Math.PI);
  assert.equal(result.pitch, 0.2);
  assert.equal(result.weaponSlot, -1);
  assert.equal(result.isAiming, true);
  assert.ok(Object.isFrozen(result));
});

test('unknown input bits are rejected', () => {
  assert.equal(
    validateClientInput({ ...valid, inputMask: KNOWN_INPUT_MASK | (1 << 10) }),
    null
  );
});

test('non-finite aim values are rejected', () => {
  assert.equal(validateClientInput({ ...valid, yaw: NaN }), null);
  assert.equal(validateClientInput({ ...valid, pitch: Infinity }), null);
});

test('pitch outside the gameplay limit is rejected', () => {
  assert.notEqual(validateClientInput({ ...valid, pitch: MAX_PITCH }), null);
  assert.equal(validateClientInput({ ...valid, pitch: MAX_PITCH + 0.001 }), null);
});

test('invalid sequence and weapon slot values are rejected', () => {
  assert.equal(validateClientInput({ ...valid, sequence: -1 }), null);
  assert.equal(validateClientInput({ ...valid, weaponSlot: -2 }), null);
  assert.equal(validateClientInput({ ...valid, weaponSlot: 4 }), null);
  assert.notEqual(validateClientInput({ ...valid, weaponSlot: 3 }), null);
  assert.equal(validateClientInput({ ...valid, weaponSlot: 128 }), null);
});

test('isAiming must be a boolean', () => {
  assert.equal(validateClientInput({ ...valid, isAiming: 1 }), null);
});
