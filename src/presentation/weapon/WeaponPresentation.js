import { WeaponEffects } from './WeaponEffects.js';
import { audio } from '../../audio/AudioManager.js';
import { PresentationColliderRegistry } from '../world/PresentationColliderRegistry.js';

export class WeaponPresentation {
  constructor({ sceneManager, renderSystem = null, impactSystem = null, colliderRegistry = null, effectStore = null } = {}) {
    this.sceneManager = sceneManager;
    this.renderSystem = renderSystem;
    this.colliderRegistry = colliderRegistry || new PresentationColliderRegistry();
    this.effects = new WeaponEffects({ sceneManager, impactSystem, effectStore });
  }

  getMuzzleWorldPosition() {
    return this.renderSystem?.weaponViewModel?.getMuzzleWorldPosition?.() || null;
  }

  getHitRenderTarget(hit, entity = null) {
    return this.colliderRegistry.getTarget(hit?.collider) || entity?.renderMesh?.mesh || null;
  }

  onWeaponFired(recoil, sfx = 'pistol') {
    this.renderSystem?.weaponViewModel?.onFired?.(recoil);
    audio.playShoot?.(sfx);
  }

  onReloadStart() {
    this.renderSystem?.weaponViewModel?.onReloadStart?.();
    audio.playReloadStart?.();
  }

  onReloadEnd() { audio.playReloadEnd?.(); }
  onEmptyClick() { audio.playEmptyClick?.(); }
  onImpact() { this.effects.playImpactAudio(); }
  onHit() { this.effects.playHitAudio(); }
  spawnPenetrationImpacts(args) { return this.effects.spawnPenetrationImpacts(args); }
  spawnFinalImpact(args) { return this.effects.spawnFinalImpact(args); }

  setWeaponType(typeId) {
    this.renderSystem?.weaponViewModel?.setWeaponType?.(typeId);
  }

  createBullet(origin, end, path) {
    return this.effects.createBullet(origin, end, path);
  }

  createBloodImpact(position, normal, renderTarget, entity) {
    return this.effects.createBloodImpact(position, normal, renderTarget, entity);
  }
}
