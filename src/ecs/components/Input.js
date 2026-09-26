// src/ecs/components/Input.js

import { INPUT_FLAGS } from '../../config/constants.js';

/**
 * Input Component Data Schema
 * Holds current and historical input bitmasks, orientation angles, 
 * and sequence numbers used for Client-Side Prediction and Server Reconciliation.
 */
export const InputComponent = {
  // Bitmask combining key states (W, A, S, D, Jump, Shoot, Reload, Crouch)
  inputMask: 0,
  // Horizontal camera/aim orientation in radians
  yaw: 0,
  // Vertical camera/aim orientation in radians
  pitch: 0,
  // Monotonically increasing sequence ID assigned to each input frame
  sequence: 0,
};

/**
 * Creates a default Input component data structure.
 * @returns {typeof InputComponent}
 */
export function createInput() {
  return {
    inputMask: 0,
    yaw: 0,
    pitch: 0,
    sequence: 0,
  };
}