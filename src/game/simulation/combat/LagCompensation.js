import { HitboxHistory } from './HitboxHistory.js';
import { nearestHistoricalHit } from './RayGeometry.js';

export class LagCompensation {
  constructor({ tickRate = 60, maxRewindMs = 200, historyTicks = 180 } = {}) {
    this.tickRate = tickRate;
    this.maxRewindTicks = Math.max(1, Math.round((maxRewindMs / 1000) * tickRate));
    this.history = new HitboxHistory({ maxTicks: historyTicks });
  }

  record(tick, hitboxes) {
    this.history.record(tick, hitboxes);
  }

  resolve({ shotTick, origin, direction, maxDistance = Infinity }) {
    const latest = this.history.latestTick();
    if (latest == null) return null;
    const requested = Number(shotTick) >>> 0;
    const minTick = Math.max(0, latest - this.maxRewindTicks);
    const rewindTick = Math.min(latest, Math.max(minTick, requested));
    const frame = this.history.sample(rewindTick);
    if (!frame) return null;
    const hit = nearestHistoricalHit(origin, direction, frame.hitboxes);
    if (!hit || hit.distance > maxDistance) return null;
    return { ...hit, rewindTick, clamped: rewindTick !== requested };
  }
}
