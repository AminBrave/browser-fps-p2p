// src/ecs/components/Input.js

import { INPUT_FLAGS } from '../../config/constants.js';

export const InputComponent = {
  inputMask: 0,
  yaw: 0,
  pitch: 0,
  sequence: 0,
  isAiming: false,
};

export function createInput() {
  return {
    inputMask: 0,
    yaw: 0,
    pitch: 0,
    sequence: 0,
    isAiming: false,
  };
}
