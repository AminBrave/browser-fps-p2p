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

  handleEvent(event, ecsWorld = null) {
    if (!event) return;
    switch (event.type) {
      case 'weaponFired':
        this.onWeaponFired(event.recoil, event.sfx);
        break;
      case 'reloadStart':
        this.onReloadStart();
        break;
      case 'reloadEnd':
        this.onReloadEnd();
        break;
      case 'emptyClick':
        this.onEmptyClick();
        break;
      case 'impact':
        this.onImpact();
        break;
      case 'hit':
        this.onHit();
        break;
      case 'weaponType': {
        if (event.isLocal) this.setWeaponType(event.typeId);
        const entity = ecsWorld?.with?.('player')?.find?.(
          (candidate) => candidate.player?.id === event.playerId
        );
        entity?.character?.setWeaponType?.(event.typeId);
        break;
      }
      default:
        break;
    }
  }

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
