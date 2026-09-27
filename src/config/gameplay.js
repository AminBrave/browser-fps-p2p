// src/config/gameplay.js

export const GAME_CONFIG = Object.freeze({
  TICK_RATE: 60,
  MAX_DECALS: 100,
  RECOIL_RECOVERY: 10.0,
  HEALTH_REGEN: Object.freeze({ DELAY_MS: 3500, RATE_PER_SECOND: 12 }),
  BOB_INTENSITY: 1.0,
  MAX_FRAME_DELTA: 0.25,
  MAX_CATCH_UP_STEPS: 8,
});
