// src/config/audio.js

export const AUDIO_CONFIG = Object.freeze({
  MASTER_GAIN: 0.58,
  SFX_GAIN: 1.15,
  AMBIENCE_GAIN: 0.16,
  COMBAT_BED: Object.freeze({
    ENABLED: true,
    WIND_URL: 'https://sfxmint.com/dl/ambience-wind-31.mp3',
    THUNDER_URL: 'https://sfxmint.com/dl/ambience-thunder-01.mp3',
    WIND_GAIN: 0.11,
    THUNDER_GAIN: 0.10,
    THUNDER_MIN_DELAY_MS: 9000,
    THUNDER_MAX_DELAY_MS: 18000,
    PLAYBACK_RATE_MIN: 0.88,
    PLAYBACK_RATE_MAX: 1.04,
    DISTANT_FIRE_MIN_DELAY_MS: 3500,
    DISTANT_FIRE_MAX_DELAY_MS: 8500,
    DISTANT_FIRE_GAIN: 0.035,
  }),
  SFX: Object.freeze({
    SHOOT_MULTIPLIER: 1.45,
    IMPACT_MULTIPLIER: 1.25,
    HIT_MULTIPLIER: 1.2,
    FOOTSTEP_MULTIPLIER: 1.1,
    MOVEMENT_MULTIPLIER: 1.05,
  }),
});
