/**
 * Collider metadata registry.
 *
 * Keeps gameplay/render bindings out of the Rapier world wrapper. Handles are
 * stable keys for the lifetime of a collider.
 */
export class ColliderRegistry {
  constructor() {
    this.entity = new Map();
    this.renderTarget = new Map();
    this.hitZone = new Map();
    this.material = new Map();
  }

  _handle(collider) {
    return collider?.handle ?? collider;
  }

  register(collider, entity, renderTarget = null, hitZone = null, materialType = null) {
    if (!collider) return;
    const handle = this._handle(collider);
    this.entity.set(handle, entity);
    if (renderTarget) this.renderTarget.set(handle, renderTarget);
    if (hitZone) this.hitZone.set(handle, hitZone);
    if (materialType) this.material.set(handle, materialType);
  }

  unregister(collider) {
    if (!collider) return;
    const handle = this._handle(collider);
    this.entity.delete(handle);
    this.renderTarget.delete(handle);
    this.hitZone.delete(handle);
    this.material.delete(handle);
  }

  getEntity(collider) { return this.entity.get(this._handle(collider)) || null; }
  getRenderTarget(collider) { return this.renderTarget.get(this._handle(collider)) || null; }
  getHitZone(collider) { return this.hitZone.get(this._handle(collider)) || null; }
  getMaterial(collider) { return this.material.get(this._handle(collider)) || 'default'; }

  isPlayerMovementCollider(collider) {
    return !!this.getEntity(collider)?.player && !this.getHitZone(collider);
  }

  clear() {
    this.entity.clear();
    this.renderTarget.clear();
    this.hitZone.clear();
    this.material.clear();
  }
}
