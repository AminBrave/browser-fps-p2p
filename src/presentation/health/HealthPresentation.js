import { audio } from '../../audio/AudioManager.js';

/** Presentation-only boundary for health, death, and respawn visuals/audio. */
export class HealthPresentation {
  constructor(impactSystem = null) {
    this.impactSystem = impactSystem;
  }

  updateImpactMarks(playerId, health, maxHealth) {
    this.impactSystem?.updatePlayerImpactMarksForHealth?.(playerId, health, maxHealth);
  }

  clearImpactMarks(playerId, amount = 1) {
    return this.impactSystem?.clearPlayerImpactMarks?.(playerId, amount) ?? 0;
  }

  onDeath({ mesh = null, isLocal = false } = {}) {
    if (mesh) mesh.visible = false;
    if (isLocal) audio.playDeath?.();
  }

  onRespawn({ mesh = null, pose = null, isLocal = false } = {}, spawn = {}) {
    if (mesh) {
      mesh.position.set(spawn.x, spawn.y, spawn.z);
      mesh.visible = !isLocal;
    }
    if (pose) {
      pose.position.y = 0;
      pose.scale.y = 1;
    }
  }
  handleEvent(event, binding = {}) { if (!event) return; const { mesh = null, pose = null } = binding; if (event.type === 'impactHealth') this.updateImpactMarks(event.playerId, event.health, event.maxHealth); else if (event.type === 'clearImpactMarks') this.clearImpactMarks(event.playerId, event.fraction); else if (event.type === 'death') this.onDeath({ mesh, isLocal: event.isLocal }); else if (event.type === 'respawn') this.onRespawn({ mesh, pose, isLocal: event.isLocal }, event.spawn); }

}
