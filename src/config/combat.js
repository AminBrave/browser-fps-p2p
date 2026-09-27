// src/config/combat.js

export const COMBAT_CONFIG = Object.freeze({
  RECONCILIATION_THRESHOLD: 0.15,
  MOVE_SPREAD_MAX: 0.035,
  HIT_ZONE_DAMAGE_MULTIPLIERS: Object.freeze({
    head: 2.0,
    leftArm: 0.65,
    rightArm: 0.65,
    leftLeg: 0.65,
    rightLeg: 0.65,
    torso: 1.0,
  }),
});
