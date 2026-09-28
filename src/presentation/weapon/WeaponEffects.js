import { createBullet } from '../effects/TracerEffects.js';
import { audio } from '../../audio/AudioManager.js';

/** Presentation-only effects boundary for weapon results. */
export class WeaponEffects {
  constructor({ sceneManager, impactSystem = null, effectStore = null } = {}) {
    this.sceneManager = sceneManager;
    this.impactSystem = impactSystem;
    this.effectStore = effectStore;
  }

  createBullet(origin, end, path) {
    return createBullet(this.effectStore, this.sceneManager, origin, end, path);
  }

  createBloodImpact(position, normal, renderTarget, ownerId = null) {
    return this.impactSystem?.spawnBloodImpact?.({ position, normal, targetMesh: renderTarget, ownerId });
  }

  spawnPenetrationImpacts({ shooterId, weaponId, direction, impacts = [], sequenceBase = 0 }) {
    for (const [index, impact] of impacts.entries()) {
      this.impactSystem?.spawnSurfaceImpact({
        position: impact.point,
        normal: impact.normal,
        material: impact.material,
        incomingDirection: direction,
        velocityBefore: impact.velocityBefore,
        velocityAfter: impact.velocityAfter,
        seed: impact.entrySeed ?? 0,
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
          seed: impact.exitSeed ?? 0,
          exit: true,
          penetrated: true,
        });
      }
    }
  }

  spawnFinalImpact({ position, normal, material, direction, velocityBefore, targetMesh, ownerId = null, shooterId, weaponId, sequence = 0 }) {
    this.impactSystem?.spawnSurfaceImpact({
      position, normal, material, incomingDirection: direction,
      velocityBefore, velocityAfter: 0, targetMesh, ownerId,
      seed: 0,
    });
  }

  playImpactAudio() { audio.playImpact?.(); }
  playHitAudio() { audio.playHit?.(); }
}
