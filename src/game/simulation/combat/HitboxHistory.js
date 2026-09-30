function cloneHitbox(hitbox) {
  return {
    entityId: hitbox.entityId,
    position: { x: hitbox.position.x, y: hitbox.position.y, z: hitbox.position.z },
    yaw: hitbox.yaw || 0,
    stance: hitbox.stance || 0,
    radius: hitbox.radius || 0,
    halfHeight: hitbox.halfHeight || 0,
    zone: hitbox.zone || 'torso',
  };
}

export class HitboxHistory {
  constructor({ maxTicks = 180 } = {}) {
    this.maxTicks = Math.max(2, Number(maxTicks) || 180);
    this.frames = [];
  }

  record(tick, hitboxes) {
    const normalizedTick = Number(tick) >>> 0;
    this.frames.push({
      tick: normalizedTick,
      hitboxes: (hitboxes || []).map(cloneHitbox),
    });
    if (this.frames.length > this.maxTicks) this.frames.splice(0, this.frames.length - this.maxTicks);
  }

  get(tick) {
    const target = Number(tick) >>> 0;
    return this.frames.find((frame) => frame.tick === target) || null;
  }

  latestTick() {
    return this.frames.length ? this.frames[this.frames.length - 1].tick : null;
  }

  oldestTick() {
    return this.frames.length ? this.frames[0].tick : null;
  }

  sample(tick) {
    if (!this.frames.length) return null;
    const target = Number(tick) >>> 0;
    let older = this.frames[0];
    let newer = this.frames[this.frames.length - 1];
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].tick <= target) {
        older = this.frames[i];
        newer = this.frames[Math.min(i + 1, this.frames.length - 1)];
        break;
      }
    }
    const span = Math.max(1, newer.tick - older.tick);
    const alpha = Math.min(1, Math.max(0, (target - older.tick) / span));
    const newerById = new Map(newer.hitboxes.map((h) => [h.entityId, h]));
    const hitboxes = older.hitboxes.map((a) => {
      const b = newerById.get(a.entityId) || a;
      return {
        ...a,
        position: {
          x: a.position.x + (b.position.x - a.position.x) * alpha,
          y: a.position.y + (b.position.y - a.position.y) * alpha,
          z: a.position.z + (b.position.z - a.position.z) * alpha,
        },
        yaw: a.yaw + (b.yaw - a.yaw) * alpha,
      };
    });
    return { tick: target, hitboxes };
  }

  clear() {
    this.frames.length = 0;
  }
}
