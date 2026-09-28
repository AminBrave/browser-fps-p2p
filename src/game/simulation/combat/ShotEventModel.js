import { GAME_CONFIG } from '../../../config/index.js';
import { EVENT_TYPES } from '../../../network/PacketTypes.js';
import { createImpactSeed } from '../../../ecs/systems/ImpactSystem.js';

/**
 * Pure conversion of an authoritative ballistic trace into a SHOT event.
 * No ECS, physics, rendering, audio, or network transport dependencies.
 */
export function buildShotEvent({
  shooterId,
  weapon,
  origin,
  end,
  hit = null,
  hitEntityId = null,
  hitZone = null,
  normal,
  direction,
  trace,
  pelletIndex = 0,
  material = null,
}) {
  const muzzleVelocity = Math.max(1, Number(weapon?.muzzleVelocity) || 500);
  const resolvedMaterial = hit?.entity?.player ? null : (material || hit?.material || null);
  const impactSeed = resolvedMaterial
    ? createImpactSeed({ shooterId, weaponId: weapon?.typeId ?? 1, position: end, material: resolvedMaterial, sequence: pelletIndex * 32 + (trace?.impacts || []).length * 2 + 7 })
    : null;

  return Object.freeze({
    type: EVENT_TYPES.SHOT,
    shooterId,
    weaponId: weapon?.typeId ?? 1,
    sfx: weapon?.sfx || 'pistol',
    origin,
    end,
    hit: !!hit,
    hitEntityId,
    hitZone: hitZone || null,
    normal,
    direction,
    material: resolvedMaterial,
    impactSeed,
    distance: trace?.distance || 0,
    muzzleVelocity,
    ballisticDrop: 0.5 * (Number(GAME_CONFIG.GRAVITY) || -19.62) * Math.pow((trace?.distance || 0) / muzzleVelocity, 2),
    terminalVelocity: trace?.velocity || muzzleVelocity,
    penetrated: trace?.penetrated || 0,
    impacts: (trace?.impacts || []).map((impact, index) => ({
      point: impact.point,
      exitPoint: impact.exitPoint,
      normal: impact.normal,
      exitNormal: impact.exitNormal,
      material: impact.material,
      velocityBefore: impact.velocityBefore,
      velocityAfter: impact.velocityAfter,
      incomingDirection: direction,
      entrySeed: createImpactSeed({ shooterId, weaponId: weapon?.typeId ?? 1, position: impact.point, material: impact.material, sequence: pelletIndex * 32 + index * 2 }),
      exitSeed: createImpactSeed({ shooterId, weaponId: weapon?.typeId ?? 1, position: impact.exitPoint, material: impact.material, sequence: pelletIndex * 32 + index * 2 + 1 }),
    })),
    primary: pelletIndex === 0,
  });
}
