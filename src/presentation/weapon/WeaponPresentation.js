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

  getHitRenderTargetByHandle(handle) {
    return this.colliderRegistry.getTarget(handle);
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

  handleEvent(event) {
    if (!event) return;
    switch (event.type) {
      case 'weaponFired': this.onWeaponFired(event.recoil, event.sfx); break;
      case 'reloadStart': this.onReloadStart(); break;
      case 'reloadEnd': this.onReloadEnd(); break;
      case 'emptyClick': this.onEmptyClick(); break;
      case 'weaponType': this.setWeaponType(event.typeId); break;
      case 'shot': {
        const shot = event.shot;
        if (!shot?.origin || !shot?.end) break;
        const targetMesh = event.targetMesh || this.getHitRenderTargetByHandle(event.hitColliderHandle);
        this.createBullet(shot.origin, shot.end, shot.trace?.path || null);
        this.spawnPenetrationImpacts({
          shooterId: shot.shooterId,
          weaponId: shot.weaponId ?? 1,
          direction: shot.direction,
          impacts: shot.impacts || [],
          sequenceBase: (shot.pelletIndex || 0) * 32,
        });
        if (shot.hit) {
          if (shot.hitEntityId != null) {
            this.createBloodImpact(shot.end, shot.normal, targetMesh, shot.hitEntityId);
          } else {
            this.spawnFinalImpact({
              position: shot.end,
              normal: shot.normal,
              material: shot.material || 'default',
              direction: shot.direction,
              velocityBefore: shot.terminalVelocity || shot.muzzleVelocity || 0,
              targetMesh,
              ownerId: null,
              shooterId: shot.shooterId,
              weaponId: shot.weaponId ?? 1,
              sequence: (shot.impacts || []).length * 2 + 7,
            });
          }
          if (shot.primary && shot.sfx) audio.playShootAt?.(shot.sfx, shot.origin);
          if (shot.primary) audio.playImpactAt?.(shot.end);
        } else if (shot.primary && shot.sfx) {
          audio.playShootAt?.(shot.sfx, shot.origin);
        }
        break;
      }
      default: break;
    }
  }

  setWeaponType(typeId) {
    this.renderSystem?.weaponViewModel?.setWeaponType?.(typeId);
  }

  createBullet(origin, end, path) {
    return this.effects.createBullet(origin, end, path);
  }

  createBloodImpact(position, normal, renderTarget, ownerId = null) {
    return this.effects.createBloodImpact(position, normal, renderTarget, ownerId);
  }
}
