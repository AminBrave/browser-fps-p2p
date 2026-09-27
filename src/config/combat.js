// src/config/combat.js

export const COMBAT_CONFIG = Object.freeze({
  RECONCILIATION_THRESHOLD: 0.15,
  MOVE_SPREAD_MAX: 0.035,
  // Standing hip-fire is deliberately less stable than crouching/prone.
  STAND_SPREAD_MULTIPLIER: 1.18,
  CROUCH_SPREAD_MULTIPLIER: 0.82,
  PRONE_SPREAD_MULTIPLIER: 0.64,
  ADS_SPREAD_MULTIPLIER: 0.16,
  ADS_MOVEMENT_MULTIPLIER: 0.45,
  SPRINT_SPREAD: 0.075,
  HIT_ZONE_DAMAGE_MULTIPLIERS: Object.freeze({
    head: 2.0,
    leftArm: 0.65,
    rightArm: 0.65,
    leftLeg: 0.65,
    rightLeg: 0.65,
    torso: 1.0,
  }),
});
