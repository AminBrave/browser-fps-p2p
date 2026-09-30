function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export class NetworkMetrics {
  constructor({ sampleLimit = 120 } = {}) {
    this.sampleLimit = Math.max(8, Number(sampleLimit) || 120);
    this.reset();
  }

  reset() {
    this.rtt = [];
    this.jitter = [];
    this.corrections = [];
    this.snapshotAge = [];
    this.interpolationUnderruns = 0;
    this.packetsLost = 0;
    this.packetsReceived = 0;
  }

  _push(list, value) {
    if (!Number.isFinite(value)) return;
    list.push(Math.max(0, value));
    if (list.length > this.sampleLimit) list.shift();
  }

  recordRtt(ms) {
    this._push(this.rtt, ms);
    if (this.rtt.length > 1) {
      const n = this.rtt.length;
      this._push(this.jitter, Math.abs(this.rtt[n - 1] - this.rtt[n - 2]));
    }
  }

  recordCorrection(magnitude) { this._push(this.corrections, magnitude); }
  recordSnapshotAge(ms) { this._push(this.snapshotAge, ms); }
  recordPacketReceived() { this.packetsReceived++; }
  recordPacketLost(count = 1) { this.packetsLost += Math.max(0, Number(count) || 0); }
  recordInterpolationUnderrun() { this.interpolationUnderruns++; }

  snapshot() {
    const lossDenominator = this.packetsReceived + this.packetsLost;
    return Object.freeze({
      rttMs: percentile(this.rtt, 0.5),
      rttP95Ms: percentile(this.rtt, 0.95),
      jitterMs: percentile(this.jitter, 0.5),
      correctionP95: percentile(this.corrections, 0.95),
      snapshotAgeMs: percentile(this.snapshotAge, 0.5),
      interpolationUnderruns: this.interpolationUnderruns,
      packetLossRatio: lossDenominator ? this.packetsLost / lossDenominator : 0,
      packetsReceived: this.packetsReceived,
      packetsLost: this.packetsLost,
    });
  }
}
