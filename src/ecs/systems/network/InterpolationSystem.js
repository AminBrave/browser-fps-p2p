// src/ecs/systems/network/InterpolationSystem.js

import { GAME_CONFIG, NETWORK_CONFIG } from '../../../config/constants.js';

/**
 * InterpolationSystem (Client-Only)
 * Buffers snapshot state updates received from the host and smoothly interpolates (LERPs)
 * remote player positions and rotations behind real-time to eliminate visual jitter.
 *
 * Uses Miniplex v2 entity objects (playerEntities is an array of entity objects).
 */
export class InterpolationSystem {
  /**
   * @param {number} [renderDelayMs]
   */
  constructor(renderDelayMs) {
    this.renderDelayMs =
      renderDelayMs ??
      GAME_CONFIG.INTERPOLATION_DELAY_MS ??
      NETWORK_CONFIG.INTERPOLATION_BUFFER_MS ??
      100;
    this.snapshotBuffer = [];
  }

  /**
   * @param {object} snapshot - Decoded state snapshot from host (must have timestamp + players/entities)
   */
  addSnapshot(snapshot) {
    if (!snapshot) return;
    // Ensure timestamp exists (Protocol.decodeWorldSnapshot already stamps it)
    if (snapshot.timestamp == null) {
      snapshot.timestamp = performance.now();
    }
    this.snapshotBuffer.push(snapshot);
    if (this.snapshotBuffer.length > 30) {
      this.snapshotBuffer.shift();
    }
  }

  /**
   * @param {object} ecsWorld
   * @param {Array<object>} playerEntities - Array of Miniplex entity objects
   * @param {object|null} localEntity - Local player entity (excluded from remote interpolation)
   * @param {number} currentTime
   */
  update(ecsWorld, playerEntities, localEntity, currentTime) {
    if (!this.snapshotBuffer || this.snapshotBuffer.length < 2) return;

    const renderTime = currentTime - this.renderDelayMs;

    while (
      this.snapshotBuffer.length > 2 &&
      this.snapshotBuffer[1].timestamp <= renderTime
    ) {
      this.snapshotBuffer.shift();
    }

    const fromSnapshot = this.snapshotBuffer[0];
    const toSnapshot = this.snapshotBuffer[1];

    if (
      !fromSnapshot ||
      !toSnapshot ||
      fromSnapshot.timestamp >= toSnapshot.timestamp
    ) {
      return;
    }

    const totalSpan = toSnapshot.timestamp - fromSnapshot.timestamp;
    if (totalSpan <= 0) return;
    const elapsedSpan = renderTime - fromSnapshot.timestamp;
    const alpha = Math.max(0, Math.min(1, elapsedSpan / totalSpan));

    const fromPlayers = fromSnapshot.players || fromSnapshot.entities || [];
    const toPlayers = toSnapshot.players || toSnapshot.entities || [];

    const entities = Array.isArray(playerEntities) ? playerEntities : [];

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity || entity === localEntity) continue;

      const playerComp = entity.player;
      const transformComp = entity.transform;
      if (!playerComp || !transformComp) continue;
      if (playerComp.isLocal) continue;

      const id = playerComp.id;
      const pFrom = fromPlayers.find((p) => (p.id ?? p.entityId) === id);
      const pTo = toPlayers.find((p) => (p.id ?? p.entityId) === id);

      if (!pFrom || !pTo) continue;

      const fx = pFrom.x ?? pFrom.position?.x ?? 0;
      const fy = pFrom.y ?? pFrom.position?.y ?? 0;
      const fz = pFrom.z ?? pFrom.position?.z ?? 0;
      const tx = pTo.x ?? pTo.position?.x ?? 0;
      const ty = pTo.y ?? pTo.position?.y ?? 0;
      const tz = pTo.z ?? pTo.position?.z ?? 0;

      transformComp.position.x = fx + (tx - fx) * alpha;
      transformComp.position.y = fy + (ty - fy) * alpha;
      transformComp.position.z = fz + (tz - fz) * alpha;

      const yawFrom = pFrom.yaw ?? pFrom.rotation?.yaw ?? 0;
      const yawTo = pTo.yaw ?? pTo.rotation?.yaw ?? 0;
      if (transformComp.rotation) {
        transformComp.rotation.yaw = this._lerpAngle(yawFrom, yawTo, alpha);
      }

      if (pTo.health !== undefined) {
        playerComp.health = pTo.health;
        playerComp.isDead = playerComp.health <= 0;
      }
    }
  }

  _lerpAngle(from, to, alpha) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * alpha;
  }
}
