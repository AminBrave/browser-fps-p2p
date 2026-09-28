import * as THREE from 'three';
import { RENDER_CONFIG } from '../../config/index.js';

export class ImpactEffectAnimator {
    _updateEffect(effect, dt, now) {
    const root = effect?.root;
    if (!root) return false;
    const elapsed = Math.max(0, (now - effect.createdAt) / 1000);
    const particles = root.getObjectByName?.('impactParticles');
    if (particles) {
      particles.children.forEach((particle) => {
        const age = elapsed + (Number(particle.userData?.age) || 0);
        const life = Math.max(0.05, Number(particle.userData?.life) || 0.5);
        if (age <= 0 || age >= life) { particle.visible = false; return; }
        particle.visible = true;
        const velocity = particle.userData?.velocity;
        if (velocity) {
          const drag = Math.max(0, Number(particle.userData?.drag) || 0);
          velocity.multiplyScalar(Math.exp(-drag * Math.max(0, dt)));
          velocity.y -= (Number(particle.userData?.gravity) || 0) * Math.max(0, dt);
          particle.position.addScaledVector(velocity, Math.max(0, dt));
        }
        const angularVelocity = particle.userData?.angularVelocity;
        if (angularVelocity) {
          particle.rotation.x += angularVelocity.x * dt;
          particle.rotation.y += angularVelocity.y * dt;
          particle.rotation.z += angularVelocity.z * dt;
          angularVelocity.x *= 0.965; angularVelocity.y *= 0.965; angularVelocity.z *= 0.965;
        }
        const fade = THREE.MathUtils.clamp(age / life, 0, 1);
        const fadeStart = particle.name === 'smoke' ? 0.18 : 0.55;
        const fadeT = THREE.MathUtils.clamp((fade - fadeStart) / Math.max(0.001, 1 - fadeStart), 0, 1);
        if (particle.material) particle.material.opacity =
          (Number(particle.userData?.baseOpacity) || 1) *
          (1 - Math.pow(fadeT, particle.name === 'smoke' ? 1.15 : 1.8));
      });
    }
    const flash = root.getObjectByName?.('impactFlash');
    if (flash) {
      const t = THREE.MathUtils.clamp(
        1 - (effect.createdAt + 80 - now) / Math.max(1, Number(RENDER_CONFIG.IMPACT_FLASH.BULLET_MS) || 90),
        0, 1
      );
      flash.visible = now < effect.createdAt + 80;
      if (flash.material) flash.material.opacity = (Number(flash.userData?.baseOpacity) || 1) * (1 - t);
    }
    return true;
  }

  getPlayerImpactMarkRemovalCount(contacts, playerId, fraction = 1) {
    const amount = THREE.MathUtils.clamp(Number(fraction) || 0, 0, 1);
    const marks = contacts.filter((entry) => entry?.effect?.metadata?.playerImpactMark && entry.effect.metadata.ownerId === playerId);
    return Math.min(marks.length, Math.floor(marks.length * amount + 1e-6));
  }

    updatePlayerImpactMarksForHealth(playerId, health, maxHealth) {
    const max = Math.max(1, Number(maxHealth) || 100);
    const current = THREE.MathUtils.clamp(Number(health) || 0, 0, max);
    const healthOpacity = 1 - current / max;
    for (const entry of this.contacts) {
      const metadata = entry?.effect?.metadata;
      if (!metadata?.playerImpactMark || metadata.ownerId !== playerId) continue;
      const mesh = entry.effect.root;
      if (!mesh) continue;
      mesh.visible = healthOpacity > 0;
      mesh.traverse?.((child) => {
        const material = child.material;
        if (!material) return;
        const materials = Array.isArray(material) ? material : [material];
        for (const mat of materials) {
          if (mat.userData.impactBaseOpacity == null) mat.userData.impactBaseOpacity = mat.opacity ?? 1;
          mat.opacity = mat.userData.impactBaseOpacity * healthOpacity;
          mat.transparent = true; mat.needsUpdate = true;
        }
      });
    }
  }
}
