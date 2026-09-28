
import * as THREE from 'three';
import { RENDER_CONFIG } from '../../config/index.js';

const MATERIAL_PRESETS = Object.freeze({
  metal: Object.freeze({
    mark: 0x17120d,
    markOpacity: 0.9,
    markRadius: 0.055,
    sparkCount: 16,
    debrisCount: 2,
    dustCount: 1,
    smokeCount: 1,
    sparkColor: 0xffa51f,
    secondaryColor: 0xffe7a1,
    particleSize: 0.025,
    particleSpeed: 3.2,
    particleSpread: 1.0,
    gravity: 4.0,
    drag: 1.8,
    life: 0.34,
    kind: 'spark',
  }),
  concrete: Object.freeze({
    mark: 0x2b2925,
    markOpacity: 0.72,
    markRadius: 0.075,
    sparkCount: 1,
    debrisCount: 7,
    dustCount: 15,
    smokeCount: 3,
    sparkColor: 0xffd27a,
    secondaryColor: 0x8b857b,
    particleSize: 0.045,
    particleSpeed: 2.2,
    particleSpread: 0.9,
    gravity: 6.5,
    drag: 1.4,
    life: 0.72,
    kind: 'dust',
  }),
  stone: Object.freeze({
    mark: 0x25221e,
    markOpacity: 0.7,
    markRadius: 0.07,
    sparkCount: 1,
    debrisCount: 8,
    dustCount: 12,
    smokeCount: 2,
    sparkColor: 0xffc56b,
    secondaryColor: 0x77716a,
    particleSize: 0.048,
    particleSpeed: 2.5,
    particleSpread: 0.95,
    gravity: 7.0,
    drag: 1.5,
    life: 0.8,
    kind: 'dust',
  }),
  wood: Object.freeze({
    mark: 0x24150d,
    markOpacity: 0.82,
    markRadius: 0.065,
    sparkCount: 1,
    debrisCount: 9,
    dustCount: 5,
    smokeCount: 2,
    sparkColor: 0xffc16a,
    secondaryColor: 0x9b6032,
    particleSize: 0.035,
    particleSpeed: 2.8,
    particleSpread: 0.8,
    gravity: 8.5,
    drag: 1.3,
    life: 0.7,
    kind: 'splinter',
  }),
  glass: Object.freeze({
    mark: 0x0e2730,
    markOpacity: 0.3,
    markRadius: 0.08,
    sparkCount: 4,
    debrisCount: 12,
    dustCount: 0,
    smokeCount: 0,
    sparkColor: 0xe9fbff,
    secondaryColor: 0x8ed7e8,
    particleSize: 0.018,
    particleSpeed: 3.8,
    particleSpread: 1.05,
    gravity: 7.0,
    drag: 0.8,
    life: 0.9,
    kind: 'shard',
  }),
  dirt: Object.freeze({
    mark: 0x5a3e24,
    markOpacity: 0.55,
    markRadius: 0.11,
    sparkCount: 0,
    debrisCount: 6,
    dustCount: 18,
    smokeCount: 4,
    sparkColor: 0xc8a36b,
    secondaryColor: 0x7b5937,
    particleSize: 0.055,
    particleSpeed: 2.0,
    particleSpread: 1.1,
    gravity: 5.0,
    drag: 1.8,
    life: 0.9,
    kind: 'dust',
  }),
  rubber: Object.freeze({
    mark: 0x111111,
    markOpacity: 0.72,
    markRadius: 0.06,
    sparkCount: 0,
    debrisCount: 7,
    dustCount: 2,
    smokeCount: 4,
    sparkColor: 0xff8a34,
    secondaryColor: 0x252525,
    particleSize: 0.042,
    particleSpeed: 2.4,
    particleSpread: 0.9,
    gravity: 5.8,
    drag: 1.5,
    life: 0.75,
    kind: 'chunk',
  }),
  foliage: Object.freeze({
    mark: 0x2f3a19,
    markOpacity: 0.35,
    markRadius: 0.07,
    sparkCount: 0,
    debrisCount: 10,
    dustCount: 3,
    smokeCount: 1,
    sparkColor: 0xb4d86b,
    secondaryColor: 0x526c2c,
    particleSize: 0.035,
    particleSpeed: 2.0,
    particleSpread: 1.2,
    gravity: 4.5,
    drag: 1.1,
    life: 0.8,
    kind: 'leaf',
  }),
  default: Object.freeze({
    mark: 0x211b17,
    markOpacity: 0.78,
    markRadius: 0.06,
    sparkCount: 2,
    debrisCount: 3,
    dustCount: 3,
    smokeCount: 1,
    sparkColor: 0xffb04a,
    secondaryColor: 0x77706a,
    particleSize: 0.035,
    particleSpeed: 2.3,
    particleSpread: 0.95,
    gravity: 6.0,
    drag: 1.5,
    life: 0.55,
    kind: 'debris',
  }),
});

const MAX_ACTIVE = Math.max(32, Number(RENDER_CONFIG.MAX_IMPACT_REACTIONS) || 96);
const MAX_PARTICLES_PER_IMPACT = Math.max(12, Number(RENDER_CONFIG.MAX_IMPACT_PARTICLES_PER_REACTION) || 28);

export class ImpactVisualFactory {
  constructor(sceneManager) {
    this.scene = sceneManager?.scene || sceneManager || null;
  }

  createSurfaceImpact(options = {}) {
    const {
      position, normal, material = 'default', incomingDirection = null,
      velocityBefore = 0, velocityAfter = 0, targetMesh = null,
      seed = 0, exit = false,
    } = options;
    if (!position) return null;
    const preset = MATERIAL_PRESETS[material] || MATERIAL_PRESETS.default;
    const n = safeNormal(normal);
    const point = new THREE.Vector3(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0).addScaledVector(n, 0.003);
    if (targetMesh?.updateWorldMatrix) targetMesh.updateWorldMatrix(true, false);
    const localPoint = targetMesh?.worldToLocal ? targetMesh.worldToLocal(point.clone()) : point.clone();
    let localNormal = n.clone();
    if (targetMesh?.matrixWorld) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(targetMesh.matrixWorld);
      localNormal.applyMatrix3(normalMatrix).normalize();
    }
    if (localNormal.lengthSq() < 1e-8) localNormal.set(0, 1, 0);

    const group = new THREE.Group();
    group.name = 'bulletImpact';
    group.renderOrder = 1000;
    group.userData.impactMaterial = material;
    group.userData.impactNormal = { x: n.x, y: n.y, z: n.z };

    this._addMark(group, localPoint, localNormal, preset, material, exit);
    if (material === 'glass') this._addGlassCracks(group, localPoint, localNormal, preset, seed);

    const particles = new THREE.Group();
    particles.name = 'impactParticles';
    particles.position.set(0, 0, 0);
    particles.userData.impactNormal = localNormal.clone();

    const speed = Math.max(0, Number(velocityBefore) || 0);
    const scale = 0.65 + THREE.MathUtils.clamp(speed > 0 ? speed / 650 : 0.35, 0.12, 1) * 0.85;
    const rng = seededRandom(seed);
    const basis = basisFromNormal(localNormal);
    const incoming = incomingDirection
      ? new THREE.Vector3(Number(incomingDirection.x) || 0, Number(incomingDirection.y) || 0, Number(incomingDirection.z) || 0)
      : localNormal.clone();
    if (incoming.lengthSq() < 1e-8) incoming.copy(localNormal);
    if (targetMesh?.worldToLocal) {
      const lp = targetMesh.worldToLocal(point.clone());
      const ldp = targetMesh.worldToLocal(point.clone().add(incoming));
      incoming.copy(ldp.sub(lp).normalize());
    } else incoming.normalize();

    const normalComponent = Math.max(0.05, Math.abs(incoming.dot(localNormal)));
    const tangentComponent = Math.sqrt(Math.max(0, 1 - normalComponent * normalComponent));
    const grazingBoost = 0.8 + tangentComponent * 1.25;
    const totalCount = Math.min(MAX_PARTICLES_PER_IMPACT, Math.ceil((preset.sparkCount + preset.debrisCount + preset.dustCount + preset.smokeCount) * scale));
    const counts = {
      spark: Math.min(preset.sparkCount, totalCount),
      debris: Math.min(preset.debrisCount, Math.max(0, totalCount - preset.sparkCount)),
      dust: Math.min(preset.dustCount, Math.max(0, totalCount - preset.sparkCount - preset.debrisCount)),
      smoke: Math.min(preset.smokeCount, Math.max(0, totalCount - preset.sparkCount - preset.debrisCount - preset.dustCount)),
    };
    const spawn = (type, count, color, speedMultiplier, sizeMultiplier, lifeMultiplier) => {
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const radial = Math.sqrt(rng());
        const normalBias = 0.25 + rng() * 0.9;
        const tangentBias = (0.35 + rng() * 0.95) * grazingBoost;
        const direction = localNormal.clone()
          .multiplyScalar(normalBias)
          .addScaledVector(basis.tangent, Math.cos(a) * radial * tangentBias)
          .addScaledVector(basis.bitangent, Math.sin(a) * radial * tangentBias)
          .normalize();
        const offset = 0.012 + radial * 0.035;
        const spawnPosition = localPoint.clone()
          .addScaledVector(localNormal, offset)
          .addScaledVector(basis.tangent, Math.cos(a) * radial * 0.045)
          .addScaledVector(basis.bitangent, Math.sin(a) * radial * 0.045);
        const particleSpeed = preset.particleSpeed * scale * speedMultiplier * (0.72 + rng() * 0.8) * (type === 'spark' ? 1.0 + tangentComponent * 1.6 : 1);
        const size = preset.particleSize * sizeMultiplier * (0.7 + rng() * 0.65);
        addParticle(particles, type, spawnPosition, direction, particleSpeed, size, color, preset.life * lifeMultiplier, preset.gravity, preset.drag, rng);
      }
    };
    spawn('spark', counts.spark, preset.sparkColor, 1.0, 1.0, 0.8);
    spawn(preset.kind === 'splinter' ? 'splinter' : preset.kind === 'shard' ? 'shard' : 'debris', counts.debris, preset.secondaryColor, 1.0, 1.0, 1.0);
    spawn('dust', counts.dust, preset.secondaryColor, 0.7, 1.45, 1.15);
    spawn('smoke', counts.smoke, preset.secondaryColor, 0.55, 2.2, 1.35);
    group.add(particles);

    const flash = new THREE.Mesh(new THREE.SphereGeometry(material === 'metal' ? 0.035 : 0.022, 6, 5), makeMaterial(preset.sparkColor, material === 'glass' ? 0.7 : 0.85, true));
    flash.name = 'impactFlash';
    flash.position.copy(localPoint);
    flash.userData.life = material === 'metal' ? 0.075 : 0.045;
    flash.userData.baseOpacity = flash.material.opacity;
    group.add(flash);
    if (targetMesh) targetMesh.add(group); else this.scene?.add?.(group);
    return group;
  }

  createBloodImpact(options = {}) {
    const { position, normal } = options;
    if (!position) return null;
    const n = safeNormal(normal);
    const point = new THREE.Vector3(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0).addScaledVector(n, 0.003);
    const targetMesh = options.targetMesh || null;
    if (targetMesh?.updateWorldMatrix) targetMesh.updateWorldMatrix(true, false);
    const localPoint = targetMesh?.worldToLocal ? targetMesh.worldToLocal(point.clone()) : point.clone();
    let localNormal = n.clone();
    if (targetMesh?.worldToLocal) localNormal = targetMesh.worldToLocal(point.clone().addScaledVector(n, 1)).sub(localPoint).normalize();
    const group = new THREE.Group();
    group.name = 'bloodImpact';
    group.renderOrder = 21;
    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), new THREE.MeshBasicMaterial({
      color: 0x8f1010, transparent: true, opacity: 0.88, side: THREE.DoubleSide,
      depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    stain.position.copy(localPoint);
    stain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
    group.add(stain);
    const tangent = new THREE.Vector3().crossVectors(Math.abs(localNormal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), localNormal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(localNormal, tangent).normalize();
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.008 + i * 0.001, 5, 4), new THREE.MeshBasicMaterial({ color: 0x8f1010, transparent: true, opacity: 0.8, depthTest: true, depthWrite: false }));
      drop.position.copy(localPoint).addScaledVector(tangent, Math.cos(a) * 0.015).addScaledVector(bitangent, Math.sin(a) * 0.015).addScaledVector(localNormal, 0.006);
      group.add(drop);
    }
    if (targetMesh) targetMesh.add(group); else this.scene?.add?.(group);
    return group;
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
}

export { MATERIAL_PRESETS, disposeObject3D };
