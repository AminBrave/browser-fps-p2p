// src/utils/AccuracyModel.js

import { COMBAT_CONFIG } from '../config/index.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Single source of truth for weapon dispersion.
 *
 * Gameplay and HUD both consume this model, so the reticle is always a
 * visualization of the same cone used by the authoritative shot simulation.
 */
export function getAccuracyState({
  stance = 0,
  speed = 0,
  maxSpeed = 10.8,
  isAiming = false,
  isSprinting = false,
  steadySpread = 0.003,
  baseSpread = 0,
  bloom = 0,
  spreadMax = 0.05,
  moveSpreadMax = 0.035,
}) {
  const stanceMultiplier =
    stance === 2 ? COMBAT_CONFIG.PRONE_SPREAD_MULTIPLIER :
    stance === 1 ? COMBAT_CONFIG.CROUCH_SPREAD_MULTIPLIER :
    COMBAT_CONFIG.STAND_SPREAD_MULTIPLIER;

  const speedT = clamp01(speed / Math.max(0.001, maxSpeed));
  const movementSpread = speedT * moveSpreadMax;

  // Sprinting is intentionally a large hip-fire penalty. ADS cannot remove it.
  const sprintSpread = isSprinting ? COMBAT_CONFIG.SPRINT_SPREAD : 0;

  // ADS tightens the cone but never makes it mathematically perfect.
  const aimMultiplier = isAiming && !isSprinting
    ? COMBAT_CONFIG.ADS_SPREAD_MULTIPLIER
    : 1;

  // Movement remains partially relevant while ADS.
  const movementMultiplier = isAiming && !isSprinting
    ? COMBAT_CONFIG.ADS_MOVEMENT_MULTIPLIER
    : 1;

  const staticSpread = (steadySpread + baseSpread + bloom) * stanceMultiplier;
  const effectiveSpread =
    staticSpread * aimMultiplier +
    movementSpread * movementMultiplier +
    sprintSpread;

  return {
    stanceMultiplier,
    speedT,
    movementSpread,
    sprintSpread,
    aimMultiplier,
    movementMultiplier,
    effectiveSpread: Math.min(
      Math.max(0, spreadMax + sprintSpread),
      Math.max(0, effectiveSpread)
    ),
    rawSpread: Math.max(0, effectiveSpread),
  };
}
