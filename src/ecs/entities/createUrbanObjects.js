// src/ecs/entities/createUrbanObjects.js
//
// Deterministic civilian/urban props. Every visible solid part is paired with
// the same Rapier primitive and the exact mesh is registered as the hit target.
// This keeps visual geometry and bullet collision geometry in one definition.

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { WORLD_CONFIG, generateObjectPlacements } from '../../config/index.js';
import { URBAN_PROP_LIBRARY } from '../../game/world/UrbanPropDefinitions.js';


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
export function createUrbanObjects(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  const config = WORLD_CONFIG.OBJECT_PLACEMENT;
  const bounds = {
    halfWidth: WORLD_CONFIG.MAP.WIDTH / 2,
    halfLength: WORLD_CONFIG.MAP.LENGTH / 2,
  };

  if (!config?.ENABLED) {
    const safe = Math.max(1, WORLD_CONFIG.MAP.WIDTH / 2 - WORLD_CONFIG.MAP.OBJECT_PADDING);
    return URBAN_PROP_LIBRARY
      .filter((spec) => Math.abs(spec.x) <= safe && Math.abs(spec.z) <= safe)
      .map((spec) => addUrbanProp(ecsWorld, physicsWorld, sceneManager, mapEntities, spec));
  }

  // Keep generated props clear of the major authored gameplay geometry.
  // This makes density changes safe without introducing invisible overlaps.
  const fixedZones = [
    ...(WORLD_CONFIG.OBJECTS.CRATE?.PLACEMENTS || []).map((p) => ({
      x: p.position.x, z: p.position.z,
      radius: Math.max(p.size.x, p.size.z) * 0.65 + 1.2,
    })),
    ...(WORLD_CONFIG.OBJECTS.TREE?.POSITIONS || []).map((p) => ({
      x: p.x, z: p.z,
      radius: (WORLD_CONFIG.OBJECTS.TREE.CANOPY?.BASE_RADIUS || 1) + 1.2,
    })),
    ...(WORLD_CONFIG.OBJECTS.CAR?.PLACEMENTS || []).map((p) => ({
      x: p.x, z: p.z,
      radius: Math.max(WORLD_CONFIG.OBJECTS.CAR.COLLIDER.BOUNDS.x, WORLD_CONFIG.OBJECTS.CAR.COLLIDER.BOUNDS.z) * 0.6 + 1.5,
    })),
  ];

  const placements = generateObjectPlacements({
    pattern: config.PATTERN,
    count: Math.min(config.MAX_OBJECTS, URBAN_PROP_LIBRARY.length * 4),
    density: config.DENSITY,
    bounds,
    padding: config.PADDING,
    minSpacing: config.MIN_SPACING,
    roadSpacing: config.ROAD_SPACING,
    seed: config.SEED,
    reservedZones: [...(config.RESERVED_ZONES || []), ...fixedZones],
    reservedRectangles: config.RESERVED_RECTANGLES,
  });

  return placements.map((placement, index) => {
    const template = URBAN_PROP_LIBRARY[index % URBAN_PROP_LIBRARY.length];
    return addUrbanProp(
      ecsWorld,
      physicsWorld,
      sceneManager,
      mapEntities,
      {
        ...template,
        x: placement.x,
        z: placement.z,
        rotationY: placement.rotationY,
        name: template.name + '_' + index,
      }
    );
  });
}
