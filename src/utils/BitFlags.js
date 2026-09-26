// src/utils/BitFlags.js

/**
 * Utility functions for bitwise operations used to pack and unpack
 * multiple boolean input states into a single integer for bandwidth efficiency.
 */

/**
 * Sets a specific flag on a bitmask.
 * @param {number} bitmask - The current bitmask integer.
 * @param {number} flag - The bitwise flag to set (e.g., INPUT_FLAGS.FORWARD).
 * @returns {number} The updated bitmask.
 */
export function setFlag(bitmask, flag) {
  return bitmask | flag;
}

/**
 * Clears a specific flag from a bitmask.
 * @param {number} bitmask - The current bitmask integer.
 * @param {number} flag - The bitwise flag to clear.
 * @returns {number} The updated bitmask.
 */
export function clearFlag(bitmask, flag) {
  return bitmask & ~flag;
}

/**
 * Checks if a specific flag is set in a bitmask.
 * @param {number} bitmask - The bitmask integer to test.
 * @param {number} flag - The bitwise flag to check for.
 * @returns {boolean} True if the flag bit is set.
 */
export function hasFlag(bitmask, flag) {
  return (bitmask & flag) !== 0;
}

/**
 * Toggles a specific flag on a bitmask.
 * @param {number} bitmask - The current bitmask integer.
 * @param {number} flag - The bitwise flag to toggle.
 * @returns {number} The updated bitmask.
 */
export function toggleFlag(bitmask, flag) {
  return bitmask ^ flag;
}