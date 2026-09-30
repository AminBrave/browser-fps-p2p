const HALF_RANGE = 0x80000000;
const UINT32 = 0xffffffff;

export function normalizeSequence(value) {
  return Number(value) >>> 0;
}

export function sequenceDistance(newer, older) {
  return (normalizeSequence(newer) - normalizeSequence(older)) >>> 0;
}

export function isNewerSequence(candidate, reference) {
  if (reference == null) return true;
  const distance = sequenceDistance(candidate, reference);
  return distance !== 0 && distance < HALF_RANGE;
}

export function isSequenceAtOrBefore(candidate, reference) {
  if (candidate === reference) return true;
  return !isNewerSequence(candidate, reference);
}

export function nextSequence(sequence) {
  return (normalizeSequence(sequence) + 1) >>> 0;
}

export { HALF_RANGE, UINT32 };
