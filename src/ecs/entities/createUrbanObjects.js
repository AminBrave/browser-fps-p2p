// src/ecs/entities/createUrbanObjects.js
//
// World placement orchestration. Urban prop definitions are data-only,
// rendering is supplied by the presentation view, and ECS/physics assembly
// is delegated to UrbanPropAssembler.

import { WORLD_CONFIG, generateObjectPlacements } from '../../config/index.js';
import { URBAN_PROP_LIBRARY } from '../../game/world/UrbanPropDefinitions.js';
import { createUrbanPropView } from '../../presentation/world/UrbanPropView.js';
import { addUrbanProp } from './UrbanPropAssembler.js';

function groundY() {
  return WORLD_CONFIG.GROUND_Y;
}

function buildUrbanProp(ecsWorld, physicsWorld, sceneManager, mapEntities, spec) {
  const view = createUrbanPropView({ ...spec, groundY: groundY() }, sceneManager);
  return addUrbanProp(
    ecsWorld,
    physicsWorld,
    mapEntities,
    { ...spec, groundY: groundY() },
    view
  );
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
      .map((spec) => buildUrbanProp(ecsWorld, physicsWorld, sceneManager, mapEntities, spec));
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
