// src/game/world/createMap.js
//
// World composition boundary. It coordinates deterministic world definitions,
// ECS/physics assembly, and presentation views without putting rendering code
// into ECS entities or gameplay simulation modules.

import { WORLD_CONFIG } from '../../config/index.js';
import {
  clampMapPosition,
  getGroundDefinition,
  getPathDefinitions,
  getBoundaryDefinitions,
  getCrateDefinitions,
  getBarrierDefinitions,
  getMountainDefinitions,
  getTreeDefinitions,
  getCarDefinitions,
  getStreetLightDefinitions,
  getDumpsterDefinitions,
} from './MapDefinitions.js';
import { MapObjectView } from '../../presentation/world/MapObjectView.js';
import { createUrbanObjects } from './createUrbanObjects.js';
import { addSolidMapEntity } from '../../ecs/entities/MapEntityAssembler.js';

const groundY = () => WORLD_CONFIG.GROUND_Y;

function primitiveCollider(physicsWorld, part) {
  return physicsWorld.createPrimitiveCollider(part);
}

function addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, definition) {
  const { position, size } = definition;
  const safePosition = clampMapPosition(position.x, position.z, size.x / 2, size.z / 2);
  const view = new MapObjectView(sceneManager).staticBox({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    size,
    color: definition.color,
    roughness: definition.roughness,
    rotationY: definition.rotationY || 0,
    name: definition.name,
  });
  const physics = physicsWorld.createStaticBox(
    safePosition.x,
    groundY() + size.y / 2,
    safePosition.z,
    size.x / 2,
    size.y / 2,
    size.z / 2,
    definition.rotationY || 0,
    definition.materialType || 'default'
  );
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: view.root,
    name: definition.name,
    presentationTargets: view.targets,
  });
}

function addPath(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  for (const definition of getPathDefinitions()) {
    const view = new MapObjectView(sceneManager).path(definition);
    const physics = physicsWorld.createStaticBox(
      definition.position.x,
      definition.position.y,
      definition.position.z,
      definition.size.x / 2,
      definition.thickness / 2,
      definition.size.z / 2,
      0,
      'default'
    );
    addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
      position: definition.position,
      physics,
      mesh: view.root,
      name: definition.name,
      materialType: 'default',
      presentationTargets: view.targets,
    });
  }
}

function addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, definition) {
  const config = WORLD_CONFIG.OBJECTS.TREE;
  const safePosition = clampMapPosition(
    definition.x,
    definition.z,
    config.CANOPY.BASE_RADIUS,
    config.CANOPY.BASE_RADIUS
  );
  const view = new MapObjectView(sceneManager).tree({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
  });
  const parts = [{
    desc: primitiveCollider(physicsWorld, {
      kind: 'cylinder',
      height: config.TRUNK.HEIGHT,
      radius: config.TRUNK.RADIUS,
    }),
    position: { x: 0, y: config.TRUNK.HEIGHT / 2, z: 0 },
    materialType: 'wood',
  }];
  for (let i = 0; i < config.CANOPY.LAYERS; i++) {
    const radius = Math.max(0.05, config.CANOPY.BASE_RADIUS - i * config.CANOPY.RADIUS_STEP);
    parts.push({
      desc: primitiveCollider(physicsWorld, {
        kind: 'cone',
        height: config.CANOPY.HEIGHT,
        radius,
      }),
      position: {
        x: 0,
        y: config.CANOPY.START_CENTER_Y + i * config.CANOPY.VERTICAL_STEP,
        z: 0,
      },
      materialType: 'foliage',
    });
  }
  const physics = physicsWorld.createStaticCompound(
    safePosition.x, groundY(), safePosition.z, parts
  );
  const entity = addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: view.root,
    name: definition.name,
    presentationTargets: view.targets,
  });
  entity.isTree = true;
  return entity;
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, definition) {
  const config = WORLD_CONFIG.OBJECTS.CAR;
  const half = {
    x: config.COLLIDER.BOUNDS.x / 2,
    z: config.COLLIDER.BOUNDS.z / 2,
  };
  const safePosition = clampMapPosition(definition.x, definition.z, half.x, half.z);
  const rotationY = definition.rotationY || 0;
  const view = new MapObjectView(sceneManager).car({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    rotationY,
    color: definition.color,
  });
  const wheelRotation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  const wheelPositions = [
    { x: config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
  ];
  const parts = [
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: config.BODY.SIZE }), position: { x: 0, y: config.BODY.CENTER_Y, z: 0 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.82, y: 0.16, z: 0.9 } }), position: { x: 0, y: 0.79, z: -1.38 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.82, y: 0.15, z: 0.65 } }), position: { x: 0, y: 0.76, z: 1.35 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: config.CABIN.SIZE }), position: { x: 0, y: config.CABIN.CENTER_Y, z: config.CABIN.CENTER_Z }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.48, y: 0.38, z: 0.036 } }), position: { x: 0, y: 1.22, z: -1.01 }, materialType: 'glass' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.48, y: 0.36, z: 0.036 } }), position: { x: 0, y: 1.21, z: 0.72 }, materialType: 'glass' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 0.036, y: 0.34, z: 1.38 } }), position: { x: -0.84, y: 1.21, z: -0.14 }, materialType: 'glass' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 0.036, y: 0.34, z: 1.38 } }), position: { x: 0.84, y: 1.21, z: -0.14 }, materialType: 'glass' },
    ...wheelPositions.map(({ x, z }) => ({
      desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: config.WHEELS.WIDTH, radius: config.WHEELS.RADIUS }),
      position: { x, y: config.WHEELS.RADIUS, z },
      rotation: wheelRotation,
      materialType: 'rubber',
    })),
  ];
  const physics = physicsWorld.createStaticCompound(
    safePosition.x, groundY(), safePosition.z, parts, rotationY
  );
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: view.root,
    name: definition.name,
    rotationY,
    presentationTargets: view.targets,
  });
}

function addStreetLight(ecsWorld, physicsWorld, sceneManager, mapEntities, definition) {
  const cfg = WORLD_CONFIG.OBJECTS.STREETLIGHT;
  const safe = clampMapPosition(definition.x, definition.z, 0.8, 0.8);
  const view = new MapObjectView(sceneManager).streetLight({
    position: { x: safe.x, y: groundY(), z: safe.z },
  });
  const parts = [
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: cfg.BASE.SIZE }), position: { x: 0, y: cfg.BASE.SIZE.y / 2, z: 0 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: cfg.POLE.HEIGHT, radius: cfg.POLE.RADIUS }), position: { x: 0, y: cfg.POLE.HEIGHT / 2 + cfg.BASE.SIZE.y, z: 0 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: cfg.ARM.LENGTH, radius: cfg.ARM.RADIUS }), position: { x: cfg.ARM.LENGTH / 2, y: cfg.POLE.HEIGHT + cfg.BASE.SIZE.y - 0.12, z: 0 }, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'sphere', radius: 0.14 }), position: { x: cfg.ARM.LENGTH, y: cfg.POLE.HEIGHT + cfg.BASE.SIZE.y - 0.12, z: 0 }, materialType: 'glass' },
  ];
  const physics = physicsWorld.createStaticCompound(safe.x, groundY(), safe.z, parts);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safe.x, y: groundY(), z: safe.z },
    physics,
    mesh: view.root,
    name: definition.name,
    presentationTargets: view.targets,
  });
}

function addDumpster(ecsWorld, physicsWorld, sceneManager, mapEntities, definition) {
  const size = WORLD_CONFIG.OBJECTS.DUMPSTER.SIZE;
  const safe = clampMapPosition(definition.x, definition.z, size.x / 2, size.z / 2);
  const view = new MapObjectView(sceneManager).dumpster({
    position: { x: safe.x, y: groundY(), z: safe.z },
  });
  const parts = [
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size }), position: { x: 0, y: size.y / 2, z: 0 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: size.x + 0.04, y: 0.08, z: size.z + 0.04 } }), position: { x: 0, y: size.y + 0.04, z: 0 }, materialType: 'metal' },
  ];
  const physics = physicsWorld.createStaticCompound(safe.x, groundY(), safe.z, parts);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safe.x, y: groundY(), z: safe.z },
    physics,
    mesh: view.root,
    name: definition.name,
    presentationTargets: view.targets,
  });
}

function addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  for (const definition of getBoundaryDefinitions()) {
    const physics = physicsWorld.createStaticBox(
      definition.x,
      groundY() + definition.size.y / 2,
      definition.z,
      definition.size.x / 2,
      definition.size.y / 2,
      definition.size.z / 2,
      0,
      definition.materialType
    );
    const view = new MapObjectView(sceneManager).boundary({
      position: { x: definition.x, y: groundY(), z: definition.z },
      size: definition.size,
    });
    addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
      position: { x: definition.x, y: groundY(), z: definition.z },
      physics,
      mesh: view.root,
      name: definition.name,
      materialType: definition.materialType,
      boundary: true,
    });
  }
}

function addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, definition) {
  const config = WORLD_CONFIG.OBJECTS.MOUNTAIN;
  const safePosition = clampMapPosition(definition.x, definition.z, config.RADIUS, config.RADIUS);
  const view = new MapObjectView(sceneManager).mountain({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
  });
  const physics = physicsWorld.createStaticCone(
    safePosition.x,
    groundY() + config.HEIGHT / 2,
    safePosition.z,
    config.RADIUS,
    config.HEIGHT,
    0,
    definition.materialType
  );
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: view.root,
    name: definition.name,
    materialType: definition.materialType,
    presentationTargets: view.targets,
  });
}

export function createMap(ecsWorld, physicsWorld, sceneManager, presentationColliderRegistry = null) {
  const mapEntities = [];
  mapEntities.presentationColliderRegistry = presentationColliderRegistry;
  const ground = getGroundDefinition();
  const groundView = new MapObjectView(sceneManager).floor(ground);
  const groundPhysics = physicsWorld.createStaticBox(
    ground.position.x,
    ground.position.y,
    ground.position.z,
    ground.size.x / 2,
    ground.size.y / 2,
    ground.size.z / 2,
    0,
    ground.materialType
  );
  addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: ground.position,
    physics: groundPhysics,
    mesh: groundView.root,
    name: 'ground',
    materialType: ground.materialType,
    presentationTargets: groundView.targets,
  });

  const safetyPhysics = physicsWorld.createWorldSafetyFloor();
  physicsWorld.registerColliderEntity(safetyPhysics.collider, mapEntities[0]);

  addPath(ecsWorld, physicsWorld, sceneManager, mapEntities);
  addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities);

  for (const definition of getStreetLightDefinitions()) addStreetLight(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);
  for (const definition of getDumpsterDefinitions()) addDumpster(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);
  createUrbanObjects(ecsWorld, physicsWorld, sceneManager, mapEntities);

  for (const definition of getCrateDefinitions()) addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);
  for (const definition of getTreeDefinitions()) addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);
  for (const definition of getCarDefinitions()) addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);
  for (const definition of getBarrierDefinitions()) addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);
  for (const definition of getMountainDefinitions()) addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, definition);

  return mapEntities;
}
