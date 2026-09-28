import {
  clearPlayerImpactMarks,
  updatePlayerImpactMarksForHealth,
} from '../../ecs/entities/createBullet.js';
import { audio } from '../../audio/AudioManager.js';

/** Presentation-only boundary for health, death, and respawn visuals/audio. */
export class HealthPresentation {
  constructor() {}

  updateImpactMarks(ecsWorld, entity, health, maxHealth) {
    updatePlayerImpactMarksForHealth(ecsWorld, entity, health, maxHealth);
  }

  clearImpactMarks(ecsWorld, entity, amount = 1) {
    clearPlayerImpactMarks(ecsWorld, entity, amount);
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
