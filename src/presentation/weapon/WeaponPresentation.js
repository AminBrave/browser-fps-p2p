import { WeaponEffects } from './WeaponEffects.js';
import { audio } from '../../audio/AudioManager.js';

/**
 * Presentation adapter for weapon effects. Gameplay systems call this small
 * boundary instead of importing Three.js-facing factories or audio directly.
 */
export class WeaponPresentation {
  constructor({ sceneManager, renderSystem = null, impactSystem = null } = {}) {
    this.sceneManager = sceneManager;
    this.renderSystem = renderSystem;
    this.effects = new WeaponEffects({ sceneManager, impactSystem });
  }

  getMuzzleWorldPosition() {
    return this.renderSystem?.weaponViewModel?.getMuzzleWorldPosition?.() || null;
  }

  onWeaponFired(recoil, sfx = 'pistol') {
    this.renderSystem?.weaponViewModel?.onFired?.(recoil);
    audio.playShoot?.(sfx);
  }

  onReloadStart() {
    this.renderSystem?.weaponViewModel?.onReloadStart?.();
    audio.playReloadStart?.();
  }

  onReloadEnd() {
    audio.playReloadEnd?.();
  }

  onEmptyClick() {
    audio.playEmptyClick?.();
  }

  onImpact() {
    this.effects.playImpactAudio();
  }

  onHit() {
    this.effects.playHitAudio();
  }

  spawnPenetrationImpacts(args) {
    return this.effects.spawnPenetrationImpacts(args);
  }

  spawnFinalImpact(args) {
    return this.effects.spawnFinalImpact(args);
  }

  setWeaponType(typeId) {
    this.renderSystem?.weaponViewModel?.setWeaponType?.(typeId);
  }

  createBullet(ecsWorld, origin, end, path) {
    return this.effects.createBullet(ecsWorld, origin, end, path);
  }

  createBloodImpact(ecsWorld, position, normal, renderTarget, entity) {
    return this.effects.createBloodImpact(ecsWorld, position, normal, renderTarget, entity);
  }
}
