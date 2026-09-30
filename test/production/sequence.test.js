import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewerSequence, isSequenceAtOrBefore, nextSequence, normalizeSequence, sequenceDistance } from '../../src/network/Sequence.js';

test('sequence arithmetic handles normal and wraparound ordering', () => {
  assert.equal(normalizeSequence(-1), 0xffffffff);
  assert.equal(sequenceDistance(2, 0xffffffff), 3);
  assert.equal(isNewerSequence(10, 9), true);
  assert.equal(isNewerSequence(0, 0xffffffff), true);
  assert.equal(isNewerSequence(0xffffffff, 0), false);
  assert.equal(isNewerSequence(5, 5), false);
  assert.equal(isNewerSequence(1, null), true);
  assert.equal(isSequenceAtOrBefore(5, 5), true);
  assert.equal(isSequenceAtOrBefore(4, 5), true);
  assert.equal(nextSequence(0xffffffff), 0);
});
