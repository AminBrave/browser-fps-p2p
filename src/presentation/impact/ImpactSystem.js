import { ImpactVisualFactory } from './ImpactVisualFactory.js';
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
    return [
      targetEntity?.player?.id ?? 'world',
      material,
      q(point.x), q(point.y), q(point.z),
      q(normal.x), q(normal.y), q(normal.z),
    ].join(':');
  }

  _addMark(group, point, normal, preset, material, exit) {
    const geometry = new THREE.CircleGeometry(
      preset.markRadius * (exit ? 0.72 : 1),
      material === 'glass' ? 16 : 20
    );
    const mesh = new THREE.Mesh(
      geometry,
      makeMaterial(preset.mark, preset.markOpacity)
    );
    mesh.name = 'impactMark';
    mesh.position.copy(point);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal
    );
    mesh.renderOrder = 1000;
    group.add(mesh);

    if (material === 'concrete' || material === 'stone' || material === 'dirt') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(
          preset.markRadius * 0.72,
          preset.markRadius * 1.25,
          18
        ),
        makeMaterial(preset.secondaryColor, 0.22)
      );
      ring.name = 'impactCraterRing';
      ring.position.copy(point).addScaledVector(normal, 0.0005);
      ring.quaternion.copy(mesh.quaternion);
      ring.renderOrder = 1001;
      group.add(ring);
    }
  }

  _addGlassCracks(group, point, normal, preset, seed) {
    const rng = seededRandom(seed ^ 0x51f15e);
    const { tangent, bitangent } = basisFromNormal(normal);
    const positions = [];
    const rays = 5 + Math.floor(rng() * 4);

    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const length = preset.markRadius * (1.2 + rng() * 1.8);
      const start = point.clone().addScaledVector(normal, 0.001);
      const end = start.clone()
        .addScaledVector(tangent, Math.cos(a) * length)
        .addScaledVector(bitangent, Math.sin(a) * length);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);

      if (rng() > 0.35) {
        const mid = start.clone().lerp(end, 0.55);
        const branchAngle = a + (rng() > 0.5 ? 0.8 : -0.8);
        const branchEnd = mid.clone()
          .addScaledVector(tangent, Math.cos(branchAngle) * length * 0.42)
          .addScaledVector(bitangent, Math.sin(branchAngle) * length * 0.42);
        positions.push(mid.x, mid.y, mid.z, branchEnd.x, branchEnd.y, branchEnd.z);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xd9f9ff,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );
    lines.name = 'glassCracks';
    lines.renderOrder = 1002;
    group.add(lines);
  }


  spawnSurfaceImpact(options = {}) {
    const {
      position, normal, material = 'default', targetMesh = null, targetEntity = null,
    } = options;
    if (!position) return null;
    const point = { x: Number(position.x) || 0, y: Number(position.y) || 0, z: Number(position.z) || 0 };
    const key = this._contactKey(point, normal, targetEntity, material);
    const duplicate = this.contacts.find((entry) => entry.key === key && performance.now() - entry.time < 80);
    if (duplicate) return duplicate.effect;
    const group = this.visualFactory.createSurfaceImpact(options);
    if (!group) return null;
    const effect = this.effectStore?.add?.({
      root: group,
      durationMs: 0,
      metadata: { type: 'impact', material, ownerId: targetEntity?.player?.id ?? null, playerImpactMark: !!targetEntity?.player },
      update: ({ dt, now, effect: currentEffect }) => this.animator.update(currentEffect, dt, now),
      dispose: ({ root }) => { root?.parent?.remove?.(root); this._disposeObject3D(root); },
    });
    if (!effect) return null;
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
      dispose: ({ root }) => { root?.parent?.remove?.(root); this._disposeObject3D(root); },
    });
    if (!effect) return null;
    this.contacts.push({ key: 'blood:' + String(ownerId) + ':' + Math.round(position.x * 80) + ':' + Math.round(position.y * 80) + ':' + Math.round(position.z * 80), time: performance.now(), effect });
    this._trimContacts();
    return effect;
  }

  _trimContacts() {
    while (this.contacts.length > MAX_ACTIVE) this.effectStore?.remove?.(this.contacts.shift()?.effect);
  }

  _disposeObject3D(root) {
    root?.traverse?.((child) => {
      child.geometry?.dispose?.();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
      else material?.dispose?.();
    });
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
      removed++;
    }
    return removed;
  }

  getPlayerImpactMarkCount(playerId) {
    return this.contacts.filter((entry) => entry?.effect?.metadata?.playerImpactMark && entry.effect.metadata.ownerId === playerId && entry.effect.root).length;
  }

  dispose() {
    for (const entry of this.contacts) this.effectStore?.remove?.(entry.effect);
    this.contacts.length = 0;
  }
}
