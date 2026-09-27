// src/config/camera.js
// First-person camera motion is intentionally low-amplitude and slow. These
// values are user-comfort settings, not gameplay physics values.

export const CAMERA_CONFIG = Object.freeze({
  FOV: 75,
  NEAR_PLANE: 0.05,
  FAR_PLANE: 500,
  MOVEMENT: Object.freeze({
    INTENSITY_SMOOTHING: 5.5,
    PHASE_SPEED_MIN_HZ: 1.25,
    PHASE_SPEED_MAX_HZ: 2.65,
    ACTIVATION_START: 0.03,
    ACTIVATION_END: 0.78,
    MAX_SPEED_FACTOR: 1.0,
    TRANSLATION_PER_ACCELERATION: 0.0009,
    ROTATION_PER_ACCELERATION: 0.0035,
  }),
  STANCE_MOTION: Object.freeze({
    STAND: Object.freeze({ vertical: 1.0, horizontal: 1.0, pitch: 1.0, yaw: 1.0, roll: 1.0, frequency: 1.0 }),
    CROUCH: Object.freeze({ vertical: 0.62, horizontal: 0.72, pitch: 0.70, yaw: 0.65, roll: 0.75, frequency: 0.78 }),
    PRONE: Object.freeze({ vertical: 0.28, horizontal: 0.42, pitch: 0.42, yaw: 0.32, roll: 0.95, frequency: 0.48 }),
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
  RECOIL_SENSITIVITY: 0.2,
  RECOIL_RECOVERY_MULTIPLIER: 1.0,
});
