/**
 * Collider metadata registry.
 *
 * Keeps gameplay metadata out of the Rapier world wrapper. Handles are
 * stable keys for the lifetime of a collider.
 */
export class ColliderRegistry {
  constructor() {
    this.entity = new Map();
    this.hitZone = new Map();
    this.material = new Map();
  }

  _handle(collider) {
    return collider?.handle ?? collider;
  }

  register(collider, entity, hitZone = null, materialType = null) {
    if (!collider) return;
    const handle = this._handle(collider);
    this.entity.set(handle, entity);
    if (hitZone) this.hitZone.set(handle, hitZone);
    else this.hitZone.delete(handle);
    if (materialType) this.material.set(handle, materialType);
    else this.material.delete(handle);
  }

  unregister(collider) {
    if (!collider) return;
    const handle = this._handle(collider);
    this.entity.delete(handle);
    this.hitZone.delete(handle);
    this.material.delete(handle);
  }

  getEntity(collider) { return this.entity.get(this._handle(collider)) || null; }
  getHitZone(collider) { return this.hitZone.get(this._handle(collider)) || null; }
  getMaterial(collider) { return this.material.get(this._handle(collider)) || 'default'; }

  isPlayerMovementCollider(collider) {
    return !!this.getEntity(collider)?.player && !this.getHitZone(collider);
  }

  clear() {
    this.entity.clear();
    this.hitZone.clear();
    this.material.clear();
  }
}
