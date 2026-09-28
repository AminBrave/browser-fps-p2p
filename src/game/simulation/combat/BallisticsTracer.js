import { GAME_CONFIG, COMBAT_CONFIG } from '../../config/index.js';

/**
 * Authoritative projectile trajectory and penetration solver.
 *
 * Physics queries are injected so combat simulation does not depend on the
 * PhysicsWorld implementation.
 */
export class BallisticsTracer {
  constructor(physicsQueries) {
    this.physicsQueries = physicsQueries;
  }

  trace(origin, direction, muzzleVelocity, range, excludeCollider, weapon = null) {
    const initialSpeed = Math.max(1, Number(muzzleVelocity) || 500);
    let velocity = {
      x: direction.x * initialSpeed,
      y: direction.y * initialSpeed,
      z: direction.z * initialSpeed,
    };
    const maxRange = Math.max(1, Number(range) || 100);
    const gravity = Number(GAME_CONFIG.GRAVITY) || -19.62;
    const drag = Math.max(0, Number(weapon?.airDrag) || 0.002);
    const penetrationPower = Math.max(0, Number(weapon?.penetrationPower) || 0);
    const maxPenetrations = 3;
    const stepDistance = 2.5;
    const maxSteps = Math.max(16, Math.min(96, Math.ceil(maxRange / stepDistance)));
    const path = [{ ...origin }];
    const impacts = [];
    let position = { ...origin };
    let travelled = 0;
    let elapsed = 0;
    let remainingEnergy = 1;
    let exclude = excludeCollider;
    let excludedPenetrationCollider = null;
    let excludedPenetrationUntil = 0;

    const result = (hit, point, flightTime, velocityValue) => ({
      hit,
      point,
      distance: travelled,
      path,
      impacts,
      velocity: velocityValue,
      remainingEnergy,
      flightTime,
      penetrated: impacts.length,
    });

    for (let i = 0; i < maxSteps && travelled < maxRange && remainingEnergy > 0.03; i++) {
      const speed = Math.max(1, Math.hypot(velocity.x, velocity.y, velocity.z));
      const step = Math.min(stepDistance, maxRange - travelled);
      const dt = step / speed;
      const dragFactor = Math.exp(-drag * step * Math.max(0.35, speed / initialSpeed));

      const next = {
        x: position.x + velocity.x * dt * dragFactor,
        y: position.y + velocity.y * dt * dragFactor + 0.5 * gravity * dt * dt,
        z: position.z + velocity.z * dt * dragFactor,
      };
      const segment = {
        x: next.x - position.x,
        y: next.y - position.y,
        z: next.z - position.z,
      };
      const segmentLength = Math.hypot(segment.x, segment.y, segment.z);
      if (segmentLength < 1e-6) break;

      const segmentDirection = {
        x: segment.x / segmentLength,
        y: segment.y / segmentLength,
        z: segment.z / segmentLength,
      };
      if (excludedPenetrationCollider && travelled >= excludedPenetrationUntil) {
        excludedPenetrationCollider = null;
      }

      const queryExclude = excludedPenetrationCollider
        ? [exclude, excludedPenetrationCollider]
        : exclude;
      const hit = this.physicsQueries?.castRay
        ? this.physicsQueries.castRay(position, segmentDirection, segmentLength, queryExclude)
        : null;

      if (!hit) {
        travelled += segmentLength;
        elapsed += dt;
        position = next;
        velocity.x *= dragFactor;
        velocity.y = velocity.y * dragFactor + gravity * dt;
        velocity.z *= dragFactor;
        path.push({ ...position });
        continue;
      }

      const hitDistance = Math.max(0, Math.min(segmentLength, Number(hit.toi) || 0));
      const hitPoint = {
        x: position.x + segmentDirection.x * hitDistance,
        y: position.y + segmentDirection.y * hitDistance,
        z: position.z + segmentDirection.z * hitDistance,
      };
      travelled += hitDistance;
      elapsed += dt * (hitDistance / Math.max(segmentLength, 1e-6));
      path.push(hitPoint);

      const hitSpeed = Math.max(1, speed * Math.exp(-drag * hitDistance));
      if (hit.entity?.player) {
        return result(hit, hitPoint, elapsed, hitSpeed);
      }

      const material = hit.material || this.physicsQueries?.getProjectileMaterial?.(hit) || 'default';
      const materials = COMBAT_CONFIG?.MATERIALS || {};
      const materialCfg = materials[material] || materials.default || { resistance: 1, maxThickness: 0.3 };
      const thicknessLimit = Math.max(0.02, Number(materialCfg.maxThickness) || 0.3);
      const resistance = Math.max(0.01, Number(materialCfg.resistance) || 1);

      const exitOrigin = {
        x: hitPoint.x + segmentDirection.x * 0.006,
        y: hitPoint.y + segmentDirection.y * 0.006,
        z: hitPoint.z + segmentDirection.z * 0.006,
      };
      const exitHit = this.physicsQueries?.getProjectileExitHit
        ? this.physicsQueries.getProjectileExitHit(hit.collider, exitOrigin, segmentDirection, thicknessLimit + 0.02)
        : null;
      const exitDistance = exitHit?.distance ?? null;
      const exitNormal = exitHit?.normal || null;

      if (exitDistance == null) return result(hit, hitPoint, elapsed, hitSpeed);

      const thickness = Math.max(0.02, Math.min(thicknessLimit, exitDistance));
      const energyCost = (thickness / thicknessLimit) * resistance;
      const penetrationRatio = penetrationPower / Math.max(0.01, energyCost);

      if (penetrationRatio < 1 || impacts.length >= maxPenetrations) {
        return result(hit, hitPoint, elapsed, hitSpeed);
      }

      const energyLoss = Math.min(0.88, energyCost / Math.max(0.01, penetrationPower));
      remainingEnergy *= Math.max(0.05, 1 - energyLoss);
      const exactExitDistance = Math.max(0.02, exitDistance);
      const exitPoint = {
        x: exitOrigin.x + segmentDirection.x * exactExitDistance,
        y: exitOrigin.y + segmentDirection.y * exactExitDistance,
        z: exitOrigin.z + segmentDirection.z * exactExitDistance,
      };
      travelled += exactExitDistance;

      const residualSpeed = hitSpeed * Math.sqrt(Math.max(0.05, remainingEnergy));
      velocity = {
        x: segmentDirection.x * residualSpeed,
        y: segmentDirection.y * residualSpeed,
        z: segmentDirection.z * residualSpeed,
      };
      const outwardNormal = exitNormal || {
        x: -segmentDirection.x,
        y: -segmentDirection.y,
        z: -segmentDirection.z,
      };
      const normalLength = Math.hypot(outwardNormal.x, outwardNormal.y, outwardNormal.z) || 1;
      const normalizedExitNormal = {
        x: outwardNormal.x / normalLength,
        y: outwardNormal.y / normalLength,
        z: outwardNormal.z / normalLength,
      };
      const exitClearance = 0.018;
      position = {
        x: exitPoint.x + normalizedExitNormal.x * exitClearance + segmentDirection.x * 0.004,
        y: exitPoint.y + normalizedExitNormal.y * exitClearance + segmentDirection.y * 0.004,
        z: exitPoint.z + normalizedExitNormal.z * exitClearance + segmentDirection.z * 0.004,
      };

      const duplicateImpact = impacts.some((impact) => {
        const contactPoints = [impact.point, impact.exitPoint].filter(Boolean);
        return contactPoints.some((point) => {
          const dx = point.x - hitPoint.x;
          const dy = point.y - hitPoint.y;
          const dz = point.z - hitPoint.z;
          return dx * dx + dy * dy + dz * dz < 0.018 * 0.018;
        });
      });
      if (duplicateImpact) {
        position = {
          x: position.x + normalizedExitNormal.x * 0.012,
          y: position.y + normalizedExitNormal.y * 0.012,
          z: position.z + normalizedExitNormal.z * 0.012,
        };
        excludedPenetrationCollider = hit.collider || null;
        excludedPenetrationUntil = travelled + 0.05;
        exclude = null;
        path.push({ ...position });
        continue;
      }

      impacts.push({
        point: { ...hitPoint },
        exitPoint: { ...exitPoint },
        normal: hit.normal,
        exitNormal: exitNormal || {
          x: -segmentDirection.x,
          y: -segmentDirection.y,
          z: -segmentDirection.z,
        },
        material,
        thickness,
        velocityBefore: hitSpeed,
        velocityAfter: residualSpeed,
        energyRemaining: remainingEnergy,
      });
      exclude = null;
      excludedPenetrationCollider = hit.collider || null;
      excludedPenetrationUntil = travelled + 0.05;
      path.push({ ...position });
    }

    return {
      hit: null,
      point: position,
      distance: travelled,
      path,
      impacts,
      velocity: Math.max(0, Math.hypot(velocity.x, velocity.y, velocity.z)),
      remainingEnergy,
      flightTime: elapsed,
      penetrated: impacts.length,
    };
  }
}
