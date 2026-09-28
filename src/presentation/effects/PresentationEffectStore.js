/**
 * Presentation-owned lifecycle for transient visual effects.
 * Effects never enter the authoritative ECS world.
 */
export class PresentationEffectStore {
  constructor() {
    this.effects = new Set();
  }

  add({ root = null, durationMs = 0, update = null, dispose = null, metadata = null } = {}) {
    const effect = {
      root,
      createdAt: performance.now(),
      durationMs: Math.max(0, Number(durationMs) || 0),
      update,
      dispose,
      metadata,
      disposed: false,
    };
    this.effects.add(effect);
    return effect;
  }

  remove(effect) {
    if (!effect || effect.disposed) return false;
    effect.disposed = true;
    this.effects.delete(effect);
    effect.dispose?.(effect);
    return true;
  }

  update(dt, now = performance.now()) {
    for (const effect of this.effects) {
      if (effect.disposed) continue;
      const elapsedMs = Math.max(0, now - effect.createdAt);
      let keep = true;

      if (effect.durationMs > 0 && elapsedMs >= effect.durationMs) {
        keep = false;
      } else if (effect.update) {
        keep = effect.update({
          effect,
          dt: Math.max(0, Number(dt) || 0),
          now,
          elapsedMs,
          progress: effect.durationMs > 0
            ? Math.min(1, elapsedMs / effect.durationMs)
            : 0,
        }) !== false;
      }

      if (!keep) this.remove(effect);
    }
  }

  clear() {
    for (const effect of Array.from(this.effects)) this.remove(effect);
  }

  dispose() {
    this.clear();
  }

  get size() {
    return this.effects.size;
  }
}
