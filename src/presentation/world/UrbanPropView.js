// src/presentation/world/UrbanPropView.js
//
// Presentation-only construction for urban props. Prop definitions remain
// browser/rendering independent; this module resolves material keys into
// Three.js materials and builds the visible hierarchy.

import * as THREE from 'three';

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x777b78, roughness: 0.88 }),
  darkConcrete: new THREE.MeshStandardMaterial({ color: 0x4e5351, roughness: 0.92 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x3b4144, metalness: 0.72, roughness: 0.34 }),
  galvanized: new THREE.MeshStandardMaterial({ color: 0x9aa1a4, metalness: 0.82, roughness: 0.28 }),
  painted: new THREE.MeshStandardMaterial({ color: 0x245f8a, metalness: 0.25, roughness: 0.52 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xd69e18, roughness: 0.55 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x765438, roughness: 0.92 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x254c5d, metalness: 0.25, roughness: 0.16, transparent: true, opacity: 0.68 }),
  red: new THREE.MeshStandardMaterial({ color: 0x8b2525, roughness: 0.62 }),
};

export function projectileMaterialType(materialKey) {
  switch (materialKey) {
    case 'glass': return 'glass';
    case 'wood': return 'wood';
    case 'rubber': return 'rubber';
    case 'concrete':
    case 'darkConcrete': return 'concrete';
    case 'metal':
    case 'galvanized':
    case 'painted':
    case 'yellow':
    case 'red': return 'metal';
    default: return 'default';
  }
}

function primitiveMesh(part) {
  let geometry;
  if (part.kind === 'box') {
    geometry = new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z);
  } else if (part.kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(
      part.radius,
      part.radius * (part.taper ?? 1),
      part.height,
      part.segments ?? 12
    );
  } else if (part.kind === 'cone') {
    geometry = new THREE.ConeGeometry(part.radius, part.height, part.segments ?? 12);
  } else {
    geometry = new THREE.SphereGeometry(
      part.radius,
      part.segments ?? 12,
      Math.max(6, Math.floor((part.segments ?? 12) * 0.65))
    );
  }

  const mesh = new THREE.Mesh(geometry, MAT[part.material] || MAT.metal);
  mesh.position.set(part.position?.x || 0, part.position?.y || 0, part.position?.z || 0);
  mesh.rotation.set(part.rotation?.x || 0, part.rotation?.y || 0, part.rotation?.z || 0);
  if (part.rotationQuaternion) {
    mesh.quaternion.set(
      part.rotationQuaternion.x,
      part.rotationQuaternion.y,
      part.rotationQuaternion.z,
      part.rotationQuaternion.w
    );
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = part.name;
  return mesh;
}

export function createUrbanPropView(spec, sceneManager = null) {
  const root = new THREE.Group();
  root.name = spec.name;
  root.position.set(spec.x, spec.groundY ?? 0, spec.z);
  root.rotation.y = spec.rotationY || 0;

  const parts = spec.parts.map((part) => {
    const mesh = primitiveMesh(part);
    root.add(mesh);
    return {
      mesh,
      materialType: projectileMaterialType(part.material),
    };
  });

  sceneManager?.scene?.add(root);

  return { root, parts };
}
