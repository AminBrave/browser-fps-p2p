import { createBullet, createBloodImpact } from '../../ecs/entities/createBullet.js';
import { audio } from '../../audio/AudioManager.js';

/**
 * Presentation adapter for weapon effects. Gameplay systems call this small
 * boundary instead of importing Three.js-facing factories or audio directly.
 */
export class WeaponPresentation {
  constructor({ sceneManager, renderSystem = null } = {}) {
    this.sceneManager = sceneManager;
    this.renderSystem = renderSystem;
  }

  getMuzzleWorldPosition() {
    return this.renderSystem?.weaponViewModel?.getMuzzleWorldPosition?.() || null;
  }

  onWeaponFired(recoil) {
    this.renderSystem?.weaponViewModel?.onFired?.(recoil);
    audio.playShoot?.(this.renderSystem?.weaponViewModel?.currentWeaponSfx || 'pistol');
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
    audio.playImpact?.();
  }

  onHit() {
    audio.playHit?.();
  }

  setWeaponType(typeId) {
    this.renderSystem?.weaponViewModel?.setWeaponType?.(typeId);
  }

  createBullet(ecsWorld, origin, end, path) {
    return createBullet(ecsWorld, this.sceneManager, origin, end, path);
  }

  createBloodImpact(ecsWorld, position, normal, renderTarget, entity) {
    return createBloodImpact(
      ecsWorld,
      this.sceneManager,
      position,
      normal,
      renderTarget,
      entity
    );
  }
}
