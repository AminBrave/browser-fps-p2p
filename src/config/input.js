// src/config/input.js

export const INPUT_FLAGS = Object.freeze({
  FORWARD: 1 << 0,
  BACKWARD: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  JUMP: 1 << 4,
  SHOOT: 1 << 5,
  RELOAD: 1 << 6,
  CROUCH: 1 << 7,
  PRONE: 1 << 8,
  SPRINT: 1 << 9,
});
