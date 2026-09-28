import { GAME_CONFIG, WORLD_CONFIG } from '../config/index.js';

/**
 * Spawn safety policy. Physics queries are injected so this module does not
 * own a Rapier world or depend on PhysicsWorld.
 */
export class SpawnSafety {
  constructor({ castRay, getPlayers }) {
    if (typeof castRay !== 'function') throw new Error('SpawnSafety requires castRay');
    this.castRay = castRay;
    this.getPlayers = typeof getPlayers === 'function' ? getPlayers : () => [];
  }

  isSafe(position, {
    radius = GAME_CONFIG.PLAYER_RADIUS,
    height = GAME_CONFIG.PLAYER_HEIGHT,
    ignoreEntity = null,
  } = {}) {
    if (!position) return false;

    const map = WORLD_CONFIG.MAP;
    const padding = 0.12;
    const halfHeight = height / 2;
    const x = Number(position.x) || 0;
    const y = Number(position.y) || 0;
    const z = Number(position.z) || 0;

    if (x - radius - padding < -map.WIDTH / 2 ||
        x + radius + padding > map.WIDTH / 2 ||
        z - radius - padding < -map.LENGTH / 2 ||
        z + radius + padding > map.LENGTH / 2) {
      return false;
    }

    for (const other of this.getPlayers()) {
      if (other === ignoreEntity || other.player?.isDead) continue;
      const p = other.transform?.position;
      if (!p) continue;

      const dx = p.x - x;
      const dz = p.z - z;
      const minDistance = radius + (Number(GAME_CONFIG.PLAYER_RADIUS) || radius) + padding;
      const verticalOverlap =
        y - halfHeight < p.y + halfHeight &&
        y + halfHeight > p.y - halfHeight;

      if (verticalOverlap && dx * dx + dz * dz < minDistance * minDistance) {
        return false;
      }
    }

    const excludedColliders = ignoreEntity?.physics?.colliders || null;
    const probeHeights = [y - halfHeight * 0.72, y, y + halfHeight * 0.72];
    const directions = 16;
    const probeDistance = radius + padding;

    for (const probeY of probeHeights) {
      for (let i = 0; i < directions; i++) {
        const angle = (i / directions) * Math.PI * 2;
        const hit = this.castRay(
          { x, y: probeY, z },
          { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
          probeDistance,
          excludedColliders
        );
        if (hit?.entity && hit.entity !== ignoreEntity) return false;
      }
    }

    const groundHit = this.castRay(
      { x, y: y + 0.05, z },
      { x: 0, y: -1, z: 0 },
      height + 0.35,
      excludedColliders
    );
    if (!groundHit || groundHit.entity?.player) return false;

    const ceilingHit = this.castRay(
      { x, y, z },
      { x: 0, y: 1, z: 0 },
      halfHeight + padding,
      excludedColliders
    );
    if (ceilingHit?.entity && ceilingHit.entity !== ignoreEntity) return false;

    return true;
  }
}
