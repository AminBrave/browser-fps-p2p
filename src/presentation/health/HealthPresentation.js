import { audio } from '../../audio/AudioManager.js';

/** Presentation-only boundary for health, death, and respawn visuals/audio. */
export class HealthPresentation {
  constructor(impactSystem = null) {
    this.impactSystem = impactSystem;
  }

  updateImpactMarks(_ecsWorld, entity, health, maxHealth) {
    this.impactSystem?.updatePlayerImpactMarksForHealth?.(entity?.player?.id ?? entity, health, maxHealth);
  }

  clearImpactMarks(_ecsWorld, entity, amount = 1) {
    return this.impactSystem?.clearPlayerImpactMarks?.(entity?.player?.id ?? entity, amount) ?? 0;
  }

  onDeath(entity) {
    if (entity?.renderMesh?.mesh) entity.renderMesh.mesh.visible = false;
    if (entity?.player?.isLocal) audio.playDeath?.();
  }

  onRespawn(entity, spawn) {
    if (entity?.renderMesh?.mesh) {
      entity.renderMesh.mesh.position.set(spawn.x, spawn.y, spawn.z);
      entity.renderMesh.mesh.visible = !entity.player?.isLocal;
    }
    if (entity?.character?.pose) {
      entity.character.pose.position.y = 0;
      entity.character.pose.scale.y = 1;
    }
  }
}
