/** Presentation-owned bindings for physics colliders. */
export class PresentationColliderRegistry {
  constructor() {
    this.targets = new Map();
  }

  _handle(collider) {
    return collider?.handle ?? collider;
  }

  register(collider, renderTarget) {
    if (!collider || !renderTarget) return;
    this.targets.set(this._handle(collider), renderTarget);
  }

  unregister(collider) {
    if (!collider) return;
    this.targets.delete(this._handle(collider));
  }

  getTarget(collider) {
    return this.targets.get(this._handle(collider)) || null;
  }

  getTargetByHandle(handle) {
    if (handle == null) return null;
    return this.targets.get(handle) || null;
  }

  clear() {
    this.targets.clear();
  }
}
