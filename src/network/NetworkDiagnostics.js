export class NetworkDiagnostics {
  constructor({ sampleLimit = 120 } = {}) {
    this.sampleLimit = Math.max(30, Number(sampleLimit) || 120);
    this.reset();
  }

  reset() {
    this.frameTimes = [];
    this.simulationTimes = [];
    this.renderTimes = [];
    this.correctionCount = 0;
  }

  _push(list, value) {
    if (!Number.isFinite(value)) return;
    list.push(Math.max(0, value));
    if (list.length > this.sampleLimit) list.shift();
  }

  recordFrame(ms) { this._push(this.frameTimes, ms); }
  recordSimulation(ms) { this._push(this.simulationTimes, ms); }
  recordRender(ms) { this._push(this.renderTimes, ms); }
  recordCorrection() { this.correctionCount++; }

  _percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
  }

  snapshot() {
    const frameP95 = this._percentile(this.frameTimes, 0.95);
    return Object.freeze({
      frameP95Ms: frameP95,
      simulationP95Ms: this._percentile(this.simulationTimes, 0.95),
      renderP95Ms: this._percentile(this.renderTimes, 0.95),
      fpsP95Equivalent: frameP95 > 0 ? 1000 / frameP95 : 0,
      corrections: this.correctionCount,
    });
  }
}
