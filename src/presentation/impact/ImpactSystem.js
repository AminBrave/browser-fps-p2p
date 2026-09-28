import { RENDER_CONFIG } from '../../config/index.js';
import { ImpactVisualFactory, disposeObject3D } from './ImpactVisualFactory.js';
import { ImpactEffectAnimator } from './ImpactEffectAnimator.js';

const MAX_ACTIVE = Math.max(32, Number(RENDER_CONFIG.MAX_IMPACT_REACTIONS) || 96);

export class ImpactSystem {
  constructor(effectStore, sceneManager) {
    this.effectStore = effectStore;
    this.visualFactory = new ImpactVisualFactory(sceneManager);
    this.animator = new ImpactEffectAnimator();
    this.contacts = [];
  }

  _contactKey(point, normal, targetEntity, material) {
    const q = (v) => Math.round(v * 80);
    return [targetEntity?.player?.id ?? 'world', material, q(point.x), q(point.y), q(point.z), q(normal?.x), q(normal?.y), q(normal?.z)].join(':');
  }

  spawnSurfaceImpact(options = {}) {
    const { position, normal, material = 'default', targetEntity = null } = options;
    if (!position) return null;
    const point = { x: Number(position.x) || 0, y: Number(position.y) || 0, z: Number(position.z) || 0 };
    const key = this._contactKey(point, normal || {}, targetEntity, material);
    const duplicate = this.contacts.find((entry) => entry.key === key && performance.now() - entry.time < 80);
    if (duplicate) return duplicate.effect;
    const group = this.visualFactory.createSurfaceImpact(options);
    if (!group) return null;
    const effect = this.effectStore?.add?.({
      root: group,
      durationMs: 0,
      metadata: { type: 'impact', material, ownerId: targetEntity?.player?.id ?? null, playerImpactMark: !!targetEntity?.player },
      update: ({ dt, now, effect: currentEffect }) => this.animator.update(currentEffect, dt, now),
      dispose: ({ root }) => { root?.parent?.remove?.(root); disposeObject3D(root); },
    });
    if (!effect) { disposeObject3D(group); return null; }
    this.contacts.push({ key, time: performance.now(), effect });
    this._trimContacts();
    return effect;
  }

  spawnBloodImpact(options = {}) {
    const { position, targetEntity = null } = options;
    if (!position) return null;
    const group = this.visualFactory.createBloodImpact(options);
    if (!group) return null;
    const ownerId = targetEntity?.player?.id ?? null;
    const effect = this.effectStore?.add?.({
      root: group,
      durationMs: 0,
      metadata: { type: 'bloodImpact', playerImpactMark: !!targetEntity?.player, ownerId },
      update: () => true,
      dispose: ({ root }) => { root?.parent?.remove?.(root); disposeObject3D(root); },
    });
    if (!effect) { disposeObject3D(group); return null; }
    this.contacts.push({ key: 'blood:' + String(ownerId) + ':' + Math.round(position.x * 80) + ':' + Math.round(position.y * 80) + ':' + Math.round(position.z * 80), time: performance.now(), effect });
    this._trimContacts();
    return effect;
  }

  _trimContacts() {
    while (this.contacts.length > MAX_ACTIVE) this.effectStore?.remove?.(this.contacts.shift()?.effect);
  }

  updatePlayerImpactMarksForHealth(playerId, health, maxHealth) {
    this.animator.updatePlayerImpactMarksForHealth(this.contacts, playerId, health, maxHealth);
  }

  clearPlayerImpactMarks(playerId, fraction = 1) {
    const removeCount = this.animator.getPlayerImpactMarkRemovalCount(this.contacts, playerId, fraction);
    let removed = 0;
    for (const entry of this.contacts.filter((entry) => entry?.effect?.metadata?.playerImpactMark && entry.effect.metadata.ownerId === playerId).slice(0, removeCount)) {
      this.effectStore?.remove?.(entry.effect);
      const index = this.contacts.indexOf(entry);
      if (index >= 0) this.contacts.splice(index, 1);
    }
    return removeCount;
  }

  getPlayerImpactMarkCount(playerId) {
    return this.contacts.filter((entry) => entry?.effect?.metadata?.playerImpactMark && entry.effect.metadata.ownerId === playerId && entry.effect.root).length;
  }

  dispose() {
    for (const entry of this.contacts) this.effectStore?.remove?.(entry.effect);
    this.contacts.length = 0;
  }
}
