export class AdaptiveInterpolation {
  constructor({ minMs = 50, maxMs = 200, initialMs = 100, safetySamples = 2 } = {}) {
    if (minMs > maxMs) throw new RangeError('minMs cannot exceed maxMs');
    this.minMs = minMs;
    this.maxMs = maxMs;
    this.delayMs = Math.min(maxMs, Math.max(minMs, initialMs));
    this.safetySamples = Math.max(1, safetySamples);
    this.intervals = [];
    this.lastArrival = null;
  }

  observeSnapshot(arrivalMs) {
    const now = Number(arrivalMs);
    if (!Number.isFinite(now)) return this.delayMs;
    if (this.lastArrival != null) {
      const interval = Math.max(0, now - this.lastArrival);
      this.intervals.push(interval);
      if (this.intervals.length > 32) this.intervals.shift();
      const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
      const variance = this.intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / this.intervals.length;
      const jitter = Math.sqrt(variance);
      const target = mean + jitter * this.safetySamples;
      this.delayMs = Math.min(this.maxMs, Math.max(this.minMs, target));
    }
    this.lastArrival = now;
    return this.delayMs;
  }

  getDelayMs() {
    return this.delayMs;
  }

  reset() {
    this.intervals.length = 0;
    this.lastArrival = null;
  }
}
