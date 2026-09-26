// src/ecs/systems/network/InterpolationSystem.js

import { GAME_CONFIG } from '../../../config/constants.js';

/**
 * InterpolationSystem (Client-Only)
 * Buffers snapshot state updates received from the host and smoothly interpolates (LERPs)
 * remote player positions and rotations ~100ms behind real-time to eliminate visual jitter.
 */
export class InterpolationSystem {
  /**
   * @param {number} renderDelayMs - Buffer delay in milliseconds (default: 100ms).
   */
  constructor(renderDelayMs = GAME_CONFIG.INTERPOLATION_DELAY_MS) {
    this.renderDelayMs = renderDelayMs;
    this.snapshotBuffer = []; // Chronologically ordered array of received host snapshots
  }

  /**
   * Pushes a new server snapshot into the interpolation buffer array.
   * 
   * @param {object} snapshot - Decoded state snapshot from host server.
   */
  addSnapshot(snapshot) {
    this.snapshotBuffer.push(snapshot);

    // Maintain maximum buffer depth to limit memory growth
    if (this.snapshotBuffer.length > 30) {
      this.snapshotBuffer.shift();
    }
  }

  /**
   * Calculates interpolated transforms for all remote player entities.
   * 
   * @param {object} ecsWorld - The ECS world instance.
   * @param {Array<number>} playerEntities - Active player entity IDs.
   * @param {number|null} localEntityId - Local player entity ID (excluded from remote interpolation).
   * @param {number} currentTime - Current client render timestamp in milliseconds.
   */
  update(ecsWorld, playerEntities, localEntityId, currentTime) {
    if (this.snapshotBuffer.length < 2) return;

    // Target render timestamp set back by buffer delay
    const renderTime = currentTime - this.renderDelayMs;

    // Drop stale snapshots older than target render timestamp
    while (this.snapshotBuffer.length > 2 && this.snapshotBuffer[1].timestamp <= renderTime) {
      this.snapshotBuffer.shift();
    }

    const fromSnapshot = this.snapshotBuffer[0];
    const toSnapshot = this.snapshotBuffer[1];

    if (!fromSnapshot || !toSnapshot || fromSnapshot.timestamp >= toSnapshot.timestamp) {
      return;
    }

    // Compute interpolation factor alpha (0.0 to 1.0)
    const totalSpan = toSnapshot.timestamp - fromSnapshot.timestamp;
    const elapsedSpan = renderTime - fromSnapshot.timestamp;
    const alpha = Math.max(0, Math.min(1, elapsedSpan / totalSpan));

    // Interpolate remote player entity transforms
    for (let i = 0; i < playerEntities.length; i++) {
      const entityId = playerEntities[i];

      // Exclude local player (driven locally by prediction/reconciliation)
      if (entityId === localEntityId) continue;

      const playerComp = ecsWorld.getComponent(entityId, 'Player');
      const transformComp = ecsWorld.getComponent(entityId, 'Transform');

      if (!playerComp || !transformComp) continue;

      // Extract entity state from target snapshots
      const pFrom = fromSnapshot.players.find(p => p.id === playerComp.id);
      const pTo = toSnapshot.players.find(p => p.id === playerComp.id);

      if (pFrom && pTo) {
        // Linear Interpolation (LERP) for Position coordinates
        transformComp.position.x = pFrom.position.x + (pTo.position.x - pFrom.position.x) * alpha;
        transformComp.position.y = pFrom.position.y + (pTo.position.y - pFrom.position.y) * alpha;
        transformComp.position.z = pFrom.position.z + (pTo.position.z - pFrom.position.z) * alpha;

        // Angle LERP for Yaw look direction
        transformComp.rotation.yaw = this._lerpAngle(pFrom.rotation.yaw, pTo.rotation.yaw, alpha);
        transformComp.rotation.pitch = this._lerpAngle(pFrom.rotation.pitch, pTo.rotation.pitch, alpha);

        // Synchronize remote health state
        playerComp.health = pTo.health;
        playerComp.isDead = playerComp.health <= 0;
      }
    }
  }

  /**
   * Angle interpolation helper handling shortest-path circular wrap-around [-PI, PI].
   * @private
   */
  _lerpAngle(from, to, alpha) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * alpha;
  }
}