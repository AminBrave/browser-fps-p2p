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


/**
 * Sample a direction around an already-resolved world-space aim vector.
 * This keeps muzzle-originated projectiles aligned with the same screen-space
 * aim ray used to acquire the crosshair target.
 */
export function sampleDirectionAroundVector({
  direction,
  spread = 0,
  random = Math.random,
}) {
  const base = {
    x: Number(direction?.x) || 0,
    y: Number(direction?.y) || 0,
    z: Number(direction?.z) || 0,
  };
  const baseLength = Math.hypot(base.x, base.y, base.z) || 1;
  base.x /= baseLength;
  base.y /= baseLength;
  base.z /= baseLength;

  const effectiveSpread = Math.max(0, Number(spread) || 0);
  if (effectiveSpread <= 0) return base;

  const reference = Math.abs(base.y) < 0.9
    ? { x: 0, y: 1, z: 0 }
    : { x: 1, y: 0, z: 0 };

  const tangent = {
    x: reference.y * base.z - reference.z * base.y,
    y: reference.z * base.x - reference.x * base.z,
    z: reference.x * base.y - reference.y * base.x,
  };
  const tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
  tangent.x /= tangentLength;
  tangent.y /= tangentLength;
  tangent.z /= tangentLength;

  const bitangent = {
    x: base.y * tangent.z - base.z * tangent.y,
    y: base.z * tangent.x - base.x * tangent.z,
    z: base.x * tangent.y - base.y * tangent.x,
  };

  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * effectiveSpread;
  const sin = Math.sin(angle) * radius;
  const cos = Math.cos(angle) * radius;

  const sampled = {
    x: base.x + tangent.x * cos + bitangent.x * sin,
    y: base.y + tangent.y * cos + bitangent.y * sin,
    z: base.z + tangent.z * cos + bitangent.z * sin,
  };
  const length = Math.hypot(sampled.x, sampled.y, sampled.z) || 1;
  return {
    x: sampled.x / length,
    y: sampled.y / length,
    z: sampled.z / length,
  };
}
