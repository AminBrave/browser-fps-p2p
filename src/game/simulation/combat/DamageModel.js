// src/game/simulation/combat/DamageModel.js

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function getDamageMultiplier(weapon, distance) {
  const start = Math.max(0, Number(weapon?.damageFalloffStart) || 0);
  const end = Math.max(
    start + 0.001,
    Number(weapon?.damageFalloffEnd) || Number(weapon?.range) || 100
  );
  const minimum = Math.min(1, Math.max(0, Number(weapon?.minDamageMultiplier) || 0.5));
  const curve = Math.max(0.25, Number(weapon?.damageFalloffCurve) || 1);

  if (distance <= start) return 1;
  if (distance >= end) return minimum;

  const normalized = clamp01((distance - start) / (end - start));
  const shaped = Math.pow(normalized, curve);
  return 1 + (minimum - 1) * shaped;
}

export function getHitZoneMultiplier(hitZone) {
  if (hitZone === 'head') return 2.0;
  if (
    hitZone === 'leftArm' ||
    hitZone === 'rightArm' ||
    hitZone === 'leftLeg' ||
    hitZone === 'rightLeg'
  ) {
    return 0.65;
  }
  return 1.0;
}

export function calculateShotDamage({
  weapon,
  distance,
  hitZone,
  terminalVelocity,
  muzzleVelocity,
  penetrated = 0,
}) {
  const baseDamage = Number(weapon?.damage) || 20;
  const distanceMultiplier = getDamageMultiplier(weapon, distance);
  const hitZoneMultiplier = getHitZoneMultiplier(hitZone);
  const safeMuzzleVelocity = Math.max(1, Number(muzzleVelocity) || 500);
  const velocityRatio = clamp01((Number(terminalVelocity) || 0) / safeMuzzleVelocity);
  const kineticEnergyMultiplier = Math.max(0.05, velocityRatio * velocityRatio);
  const penetrationDamageLoss = Number(weapon?.penetrationDamageLoss) || 0;
  const legacyPenetrationPenalty = Math.max(
    0.1,
    1 - penetrationDamageLoss * Math.max(0, Number(penetrated) || 0)
  );

  return baseDamage *
    distanceMultiplier *
    hitZoneMultiplier *
    kineticEnergyMultiplier *
    legacyPenetrationPenalty;
}
