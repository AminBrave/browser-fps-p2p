import { INPUT_FLAGS } from '../config/input.js';
import { WEAPON_LOADOUT } from '../config/weapons.js';

const KNOWN_INPUT_MASK =
  INPUT_FLAGS.FORWARD |
  INPUT_FLAGS.BACKWARD |
  INPUT_FLAGS.LEFT |
  INPUT_FLAGS.RIGHT |
  INPUT_FLAGS.JUMP |
  INPUT_FLAGS.SHOOT |
  INPUT_FLAGS.RELOAD |
  INPUT_FLAGS.CROUCH |
  INPUT_FLAGS.PRONE |
  INPUT_FLAGS.SPRINT;

const MAX_PITCH = (89 * Math.PI) / 180;
const MAX_WEAPON_SLOT = Math.max(-1, ...WEAPON_LOADOUT.map((weapon) => Number(weapon?.SLOT)).filter(Number.isInteger));

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeYaw(yaw) {
  const fullTurn = Math.PI * 2;
  const wrapped = ((yaw + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function validateClientInput(input) {
  if (!input || typeof input !== 'object') return null;

  const sequence = Number(input.sequence);
  const inputMask = Number(input.inputMask);
  const yaw = Number(input.yaw);
  const pitch = Number(input.pitch);
  const weaponSlot = Number(input.weaponSlot);

  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) return null;
  if (!Number.isInteger(inputMask) || inputMask < 0 || (inputMask & ~KNOWN_INPUT_MASK) !== 0) return null;
  if (!isFiniteNumber(yaw) || !isFiniteNumber(pitch)) return null;
  if (Math.abs(pitch) > MAX_PITCH) return null;
  if (!Number.isInteger(weaponSlot) || weaponSlot < -1 || weaponSlot > MAX_WEAPON_SLOT) return null;
  if (typeof input.isAiming !== 'boolean') return null;

  return Object.freeze({
    sequence: sequence >>> 0,
    inputMask,
    yaw: normalizeYaw(yaw),
    pitch,
    weaponSlot,
    isAiming: input.isAiming,
  });
}

export { KNOWN_INPUT_MASK, MAX_PITCH };
