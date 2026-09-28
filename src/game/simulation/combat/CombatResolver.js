import { calculateShotDamage } from './DamageModel.js';

/**
 * Converts an authoritative projectile hit into a gameplay damage command.
 * No ECS, physics, rendering, audio, or networking dependencies.
 */
export class CombatResolver {
  resolvePlayerHit({
    attackerId,
    targetEntity,
    weapon,
    distance,
    hitZone,
    terminalVelocity,
    muzzleVelocity,
    penetrated = 0,
  }) {
    if (!targetEntity?.player || targetEntity.player.isDead) return null;
    if (attackerId != null && targetEntity.player.id === attackerId) return null;

    const damage = calculateShotDamage({
      weapon,
      distance,
      hitZone,
      terminalVelocity,
      muzzleVelocity,
      penetrated,
    });

    if (!Number.isFinite(damage) || damage <= 0) return null;

    return Object.freeze({
      targetEntity,
      attackerId: attackerId ?? null,
      amount: damage,
      hitZone: hitZone || null,
    });
  }
}
