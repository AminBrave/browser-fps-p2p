// src/ecs/entities/createUrbanObjects.js
//
// Deterministic civilian/urban props. World definitions are data-only;
// presentation builds the visible meshes while this module owns ECS/physics
// registration.

import RAPIER from '@dimforge/rapier3d-compat';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { WORLD_CONFIG, generateObjectPlacements } from '../../config/index.js';
import { URBAN_PROP_LIBRARY } from '../../game/world/UrbanPropDefinitions.js';
import { createUrbanPropView } from '../../presentation/world/UrbanPropView.js';

function groundY() {
  return WORLD_CONFIG.GROUND_Y;
}

function primitiveCollider(part) {
  let desc;
  if (part.kind === 'box') {
    desc = RAPIER.ColliderDesc.cuboid(part.size.x / 2, part.size.y / 2, part.size.z / 2);
  } else if (part.kind === 'cylinder') {
    desc = RAPIER.ColliderDesc.cylinder(part.height / 2, part.radius);
  } else if (part.kind === 'cone') {
    desc = RAPIER.ColliderDesc.cone(part.height / 2, part.radius);
  } else {
    desc = RAPIER.ColliderDesc.ball(part.radius);
  }
  desc.setTranslation(part.position?.x || 0, part.position?.y || 0, part.position?.z || 0);
  if (part.rotationQuaternion) desc.setRotation(part.rotationQuaternion);
  return desc;
}

function addUrbanProp(ecsWorld, physicsWorld, sceneManager, mapEntities, spec) {
  const ground = groundY();
  const view = createUrbanPropView({ ...spec, groundY: ground }, sceneManager);
  const parts = spec.parts.map((part, index) => ({
    desc: primitiveCollider(part),
    materialType: view.parts[index].materialType,
  }));

  const physics = physicsWorld.createStaticCompound(spec.x, ground, spec.z, parts, spec.rotationY || 0);
  const entity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    isUrbanObject: true,
    urbanType: spec.type,
    transform: createTransform(spec.x, ground, spec.z, spec.rotationY || 0),
    physics: {
      ...createPhysics(physics.body, physics.collider),
      colliders: physics.colliders,
    },
    renderMesh: { mesh: view.root },
  });

  for (let i = 0; i < physics.colliders.length; i++) {
    physicsWorld.registerColliderEntity(
      physics.colliders[i],
      entity,
      physics.colliderTargets?.[i] || null,
      physics.hitZones?.[i] || null,
      physics.colliderMaterials?.[i] || null
    );
    const target = physics.colliderTargets?.[i] || null;
    if (target) mapEntities.presentationColliderRegistry?.register(physics.colliders[i], target);
  }

  mapEntities.push(entity);
  return entity;
}

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

  const fixedZones = [
    ...(WORLD_CONFIG.OBJECTS.CRATE?.PLACEMENTS || []).map((p) => ({
      x: p.position.x,
      z: p.position.z,
      radius: Math.max(p.size.x, p.size.z) * 0.65 + 1.2,
    })),
    ...(WORLD_CONFIG.OBJECTS.TREE?.POSITIONS || []).map((p) => ({
      x: p.x,
      z: p.z,
      radius: (WORLD_CONFIG.OBJECTS.TREE.CANOPY?.BASE_RADIUS || 1) + 1.2,
    })),
    ...(WORLD_CONFIG.OBJECTS.CAR?.PLACEMENTS || []).map((p) => ({
      x: p.x,
      z: p.z,
      radius: Math.max(
        WORLD_CONFIG.OBJECTS.CAR.COLLIDER.BOUNDS.x,
        WORLD_CONFIG.OBJECTS.CAR.COLLIDER.BOUNDS.z
      ) * 0.6 + 1.5,
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
