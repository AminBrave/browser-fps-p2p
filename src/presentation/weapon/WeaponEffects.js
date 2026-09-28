import { createBullet, createBloodImpact } from '../../ecs/entities/createBullet.js';
import { createImpactSeed } from '../../game/simulation/combat/ImpactSeed.js';
import { audio } from '../../audio/AudioManager.js';

/** Presentation-only effects boundary for weapon results. */
export class WeaponEffects {
  constructor({ sceneManager, impactSystem = null } = {}) {
    this.sceneManager = sceneManager;
    this.impactSystem = impactSystem;
  }

  createBullet(ecsWorld, origin, end, path) {
    return createBullet(ecsWorld, this.sceneManager, origin, end, path);
  }

  createBloodImpact(ecsWorld, position, normal, renderTarget, entity) {
    return createBloodImpact(ecsWorld, this.sceneManager, position, normal, renderTarget, entity);
  }

  spawnPenetrationImpacts({ shooterId, weaponId, direction, impacts = [] }) {
    for (const [index, impact] of impacts.entries()) {
      this.impactSystem?.spawnSurfaceImpact({
        position: impact.point,
        normal: impact.normal,
        material: impact.material,
        incomingDirection: direction,
        velocityBefore: impact.velocityBefore,
        velocityAfter: impact.velocityAfter,
        seed: createImpactSeed({ shooterId, weaponId, position: impact.point, material: impact.material, sequence: index * 2 }),
        penetrated: true,
      });
      if (impact.exitPoint) {
        this.impactSystem?.spawnSurfaceImpact({
          position: impact.exitPoint,
          normal: impact.exitNormal || impact.normal,
          material: impact.material,
          incomingDirection: direction,
          velocityBefore: impact.velocityAfter,
          velocityAfter: impact.velocityAfter,
          seed: createImpactSeed({ shooterId, weaponId, position: impact.exitPoint, material: impact.material, sequence: index * 2 + 1 }),
          exit: true,
          penetrated: true,
        });
      }
    }
  }

  spawnFinalImpact({ position, normal, material, direction, velocityBefore, targetMesh, targetEntity, shooterId, weaponId, sequence = 0 }) {
    this.impactSystem?.spawnSurfaceImpact({
      position, normal, material, incomingDirection: direction,
      velocityBefore, velocityAfter: 0, targetMesh, targetEntity,
      seed: createImpactSeed({ shooterId, weaponId, position, material, sequence }),
    });
  }

  playImpactAudio() { audio.playImpact?.(); }
  playHitAudio() { audio.playHit?.(); }
}
