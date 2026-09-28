// src/game/simulation/combat/ShotDirection.js

/**
 * Sample one projectile direction from the weapon's aim angles and circular
 * spread cone. The RNG is injected so authoritative gameplay can later use a
 * deterministic seed without changing the direction math.
 */
export function sampleShotDirection({
  yaw,
  pitch,
  spread = 0,
  random = Math.random,
}) {
  let yawOffset = 0;
  let pitchOffset = 0;

  const effectiveSpread = Math.max(0, Number(spread) || 0);
  if (effectiveSpread > 0) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * effectiveSpread;
    yawOffset = Math.cos(angle) * radius;
    pitchOffset = Math.sin(angle) * radius;
  }

  const shotYaw = Number(yaw) || 0;
  const shotPitch = Number(pitch) || 0;
  const finalYaw = shotYaw + yawOffset;
  const finalPitch = shotPitch + pitchOffset;
  const cosPitch = Math.cos(finalPitch);

  const direction = {
    x: -Math.sin(finalYaw) * cosPitch,
    y: Math.sin(finalPitch),
    z: -Math.cos(finalYaw) * cosPitch,
  };

  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  direction.x /= length;
  direction.y /= length;
  direction.z /= length;

  return direction;
}
