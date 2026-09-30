/**
 * Deterministic simulation clock.
 * Wall-clock time is converted into integer simulation ticks once.
 */
export class SimulationClock {
  constructor({ tickRate = 60, maxCatchUpTicks = 5 } = {}) {
    if (!Number.isFinite(tickRate) || tickRate <= 0) throw new RangeError('tickRate must be positive');
    if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1) throw new RangeError('maxCatchUpTicks must be a positive integer');
    this.tickRate = tickRate;
    this.fixedDelta = 1 / tickRate;
    this.maxCatchUpTicks = maxCatchUpTicks;
    this.tick = 0;
    this.accumulator = 0;
  }

  reset() {
    this.tick = 0;
    this.accumulator = 0;
  }

  advance(frameDeltaSeconds, onTick) {
    const delta = Math.min(Math.max(Number(frameDeltaSeconds) || 0, 0), 0.25);
    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.fixedDelta && steps < this.maxCatchUpTicks) {
      this.tick++;
      onTick?.(this.fixedDelta, this.tick);
      this.accumulator -= this.fixedDelta;
      steps++;
    }
    const dropped = steps === this.maxCatchUpTicks && this.accumulator >= this.fixedDelta;
    if (dropped) this.accumulator = 0;
    return {
      steps,
      tick: this.tick,
      alpha: this.accumulator / this.fixedDelta,
      dropped,
    };
  }

  tickToSeconds(tick = this.tick) {
    return (Number(tick) >>> 0) * this.fixedDelta;
  }

  secondsToTicks(seconds) {
    return Math.max(0, Math.round((Number(seconds) || 0) * this.tickRate));
  }
}
