export class NetworkSimulator {
  constructor({
    latencyMs = 0,
    jitterMs = 0,
    loss = 0,
    duplicate = 0,
    reorder = 0,
    bandwidthBytesPerSecond = Infinity,
    random = Math.random,
  } = {}) {
    this.latencyMs = Math.max(0, Number(latencyMs) || 0);
    this.jitterMs = Math.max(0, Number(jitterMs) || 0);
    this.loss = Math.min(1, Math.max(0, Number(loss) || 0));
    this.duplicate = Math.min(1, Math.max(0, Number(duplicate) || 0));
    this.reorder = Math.min(1, Math.max(0, Number(reorder) || 0));
    this.bandwidthBytesPerSecond = Number.isFinite(bandwidthBytesPerSecond) && bandwidthBytesPerSecond > 0 ? bandwidthBytesPerSecond : Infinity;
    this.random = random;
    this.queue = [];
    this.nextAvailableAt = 0;
  }

  send(payload, nowMs = 0) {
    if (this.random() < this.loss) return 0;
    const bytes = payload?.byteLength ?? payload?.length ?? 0;
    const serializationMs = Number.isFinite(this.bandwidthBytesPerSecond) ? (bytes / this.bandwidthBytesPerSecond) * 1000 : 0;
    const jitter = (this.random() * 2 - 1) * this.jitterMs;
    const readyAt = Math.max(Number(nowMs) || 0, this.nextAvailableAt) + this.latencyMs + jitter + serializationMs;
    this.nextAvailableAt = Math.max(Number(nowMs) || 0, this.nextAvailableAt) + serializationMs;
    const packet = { payload, deliverAt: Math.max(Number(nowMs) || 0, readyAt) };
    this.queue.push(packet);
    if (this.random() < this.duplicate) this.queue.push({ ...packet, deliverAt: packet.deliverAt + 0.001 });
    if (this.random() < this.reorder && this.queue.length > 1) {
      const last = this.queue.length - 1;
      [this.queue[last], this.queue[last - 1]] = [this.queue[last - 1], this.queue[last]];
    }
    return 1;
  }

  receive(nowMs) {
    const now = Number(nowMs) || 0;
    const ready = [];
    const pending = [];
    for (const packet of this.queue) {
      if (packet.deliverAt <= now) ready.push(packet.payload);
      else pending.push(packet);
    }
    this.queue = pending;
    return ready;
  }

  clear() {
    this.queue.length = 0;
    this.nextAvailableAt = 0;
  }
}
