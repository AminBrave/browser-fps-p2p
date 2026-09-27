// src/config/controls.js

export const DEFAULT_KEYBINDINGS = {
  MOVE_FORWARD: 'KeyW',
  MOVE_BACKWARD: 'KeyS',
  MOVE_LEFT: 'KeyA',
  MOVE_RIGHT: 'KeyD',
  JUMP: 'Space',
  CROUCH: 'KeyC',
  PRONE: 'KeyZ',
  RELOAD: 'KeyR',
  SHOOT: 'Mouse0',
  AIM: 'Mouse2',
  WEAPON_1: 'Digit1',
  WEAPON_2: 'Digit2',
  WEAPON_3: 'Digit3',
  WEAPON_4: 'Digit4',
};

export const MOUSE_CONFIG = {
  SENSITIVITY: 0.002,
  AIM_SENSITIVITY_MULTIPLIER: 0.65,
  INVERT_Y: false,
};

export const HUD_HINTS = [
  'WASD — Move',
  'Mouse — Look',
  'LMB — Fire',
  'RMB — Aim / Zoom',
  'R — Reload',
  '1-4 — Weapons',
  'C — Crouch',
  'Z — Prone',
  'Space — Jump',
  'Click — Lock mouse',
];
