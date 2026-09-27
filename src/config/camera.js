// src/config/camera.js
// First-person camera motion is intentionally low-amplitude and slow. These
// values are user-comfort settings, not gameplay physics values.

export const CAMERA_CONFIG = Object.freeze({
  FOV: 75,
  NEAR_PLANE: 0.05,
  FAR_PLANE: 500,
  MOVEMENT: Object.freeze({
    INTENSITY_SMOOTHING: 4.0,
    PHASE_SPEED_MIN_HZ: 1.25,
    PHASE_SPEED_MAX_HZ: 1.85,
    ACTIVATION_START: 0.08,
    ACTIVATION_END: 0.85,
    MAX_SPEED_FACTOR: 1.0,
  }),
  BOB: Object.freeze({
    VERTICAL_METERS: 0.0035,
    HORIZONTAL_METERS: 0.0020,
    PITCH_RADIANS: 0.0012,
    YAW_RADIANS: 0.0007,
    ROLL_RADIANS: 0.0018,
  }),
  LANDING: Object.freeze({
    MAX_INTENSITY: 0.22,
    VERTICAL_METERS: 0.0045,
    PITCH_RADIANS: 0.0025,
    ROLL_RADIANS: 0.0012,
    DECAY_PER_SECOND: 2.0,
    DETECT_FALL_SPEED: -1.5,
    DETECT_LANDING_SPEED: -0.2,
  }),
  NETWORK_CORRECTION_SMOOTHING: 10.0,
  RECOIL_SENSITIVITY: 0.2,
  RECOIL_RECOVERY_MULTIPLIER: 1.0,
});
