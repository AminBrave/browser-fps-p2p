const UINT32_HALF = 0x80000000;

function isNewerTick(next, previous) {
  if (previous == null) return true;
  const delta = (Number(next) - Number(previous)) >>> 0;
  return delta !== 0 && delta < UINT32_HALF;
}

export class NetworkClock {
  constructor({ tickRate = 60, smoothing = 0.08 } = {}) {
    if (!Number.isFinite(tickRate) || tickRate <= 0) throw new RangeError('tickRate must be positive');
    if (!Number.isFinite(smoothing) || smoothing <= 0 || smoothing > 1) throw new RangeError('smoothing must be in (0, 1]');
    this.tickRate = tickRate;
    this.smoothing = smoothing;
    this.reset();
  }

  reset() {
    this.offsetMs = null;
    this.lastServerTick = null;
    this.samples = 0;
  }

  observe(serverTick, localArrivalMs) {
    if (!Number.isFinite(serverTick) || !Number.isFinite(localArrivalMs)) return this.offsetMs;
    if (!isNewerTick(serverTick, this.lastServerTick)) return this.offsetMs;
    const serverTimeMs = (Number(serverTick) / this.tickRate) * 1000;
    const sample = Number(localArrivalMs) - serverTimeMs;
    this.offsetMs = this.offsetMs == null
      ? sample
      : this.offsetMs + (sample - this.offsetMs) * this.smoothing;
    this.lastServerTick = Number(serverTick) >>> 0;
    this.samples++;
    return this.offsetMs;
  }

  serverTickToLocalMs(serverTick) {
    if (!Number.isFinite(serverTick)) return null;
    if (this.offsetMs == null) return null;
    return (Number(serverTick) / this.tickRate) * 1000 + this.offsetMs;
  }

  localMsToServerTick(localMs) {
    if (!Number.isFinite(localMs) || this.offsetMs == null) return null;
    return ((Number(localMs) - this.offsetMs) * this.tickRate / 1000) >>> 0;
  }

  getOffsetMs() {
    return this.offsetMs;
  }

  getState() {
    return Object.freeze({
      tickRate: this.tickRate,
      offsetMs: this.offsetMs,
      lastServerTick: this.lastServerTick,
      samples: this.samples,
    });
  }
}

export { isNewerTick };
