// src/ecs/entities/createMap.js

import { MapObjectView } from '../../presentation/world/MapObjectView.js';
import { WORLD_CONFIG } from '../../config/index.js';
import { createUrbanObjects } from './createUrbanObjects.js';
import { addSolidMapEntity } from './MapEntityAssembler.js';

function primitiveCollider(physicsWorld, part) {
  return physicsWorld.createPrimitiveCollider(part);
}

function clampToIsland(x, z, halfExtentX = 0, halfExtentZ = 0) {
  const { WIDTH, LENGTH, OBJECT_PADDING } = WORLD_CONFIG.MAP;
  const maxX = Math.max(0, WIDTH / 2 - OBJECT_PADDING - halfExtentX);
  const maxZ = Math.max(0, LENGTH / 2 - OBJECT_PADDING - halfExtentZ);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    z: Math.max(-maxZ, Math.min(maxZ, z)),
  };
}

function addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
  position, size, color, roughness = 0.7, name = 'box', rotationY = 0, materialType = 'wood',
}) {
  const safePosition = clampToIsland(position.x, position.z, size.x / 2, size.z / 2);
  const view = new MapObjectView(sceneManager).staticBox({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    size, color, roughness, rotationY, name,
  });
  const physics = physicsWorld.createStaticBox(
    safePosition.x, groundY() + size.y / 2, safePosition.z,
    size.x / 2, size.y / 2, size.z / 2, rotationY, materialType
  );
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics, mesh: view.root, name, presentationTargets: view.targets,
  });
}

function addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, position) {
  const config = WORLD_CONFIG.OBJECTS.TREE;
  const safePosition = clampToIsland(position.x, position.z, config.CANOPY.BASE_RADIUS, config.CANOPY.BASE_RADIUS);
  const view = new MapObjectView(sceneManager).tree({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
  });

  const compoundParts = [{
    desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: config.TRUNK.HEIGHT, radius: config.TRUNK.RADIUS }),
    position: { x: 0, y: config.TRUNK.HEIGHT / 2, z: 0 },
    materialType: 'wood',
  }];

  for (let i = 0; i < config.CANOPY.LAYERS; i++) {
    const radius = Math.max(0.05, config.CANOPY.BASE_RADIUS - i * config.CANOPY.RADIUS_STEP);
    const centerY = config.CANOPY.START_CENTER_Y + i * config.CANOPY.VERTICAL_STEP;
    compoundParts.push({
      desc: primitiveCollider(physicsWorld, { kind: 'cone', height: config.CANOPY.HEIGHT, radius }),
      position: { x: 0, y: centerY, z: 0 },
      materialType: 'foliage',
    });
  }

  const physics = physicsWorld.createStaticCompound(
    safePosition.x, groundY(), safePosition.z, compoundParts
  );
  const entity = addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics, mesh: view.root, name: 'tree', presentationTargets: view.targets,
  });
  entity.isTree = true;
  return entity;
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const config = WORLD_CONFIG.OBJECTS.CAR;
  const half = { x: config.COLLIDER.BOUNDS.x / 2, z: config.COLLIDER.BOUNDS.z / 2 };
  const safePosition = clampToIsland(placement.x, placement.z, half.x, half.z);
  const rotationY = placement.rotationY || 0;
  const view = new MapObjectView(sceneManager).car({
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    rotationY,
    color: placement.color,
  });
  const wheelRotation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  const wheelPositions = [
    { x: config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
  ];
  const compoundParts = [
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: config.BODY.SIZE }), position: { x: 0, y: config.BODY.CENTER_Y, z: 0 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.82, y: 0.16, z: 0.9 } }), position: { x: 0, y: 0.79, z: -1.38 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.82, y: 0.15, z: 0.65 } }), position: { x: 0, y: 0.76, z: 1.35 }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: config.CABIN.SIZE }), position: { x: 0, y: config.CABIN.CENTER_Y, z: config.CABIN.CENTER_Z }, materialType: 'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.48, y: 0.38, z: 0.036 } }), position: { x: 0, y: 1.22, z: -1.01 }, materialType: 'glass' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 1.48, y: 0.36, z: 0.036 } }), position: { x: 0, y: 1.21, z: 0.72 }, materialType: 'glass' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 0.036, y: 0.34, z: 1.38 } }), position: { x: -0.84, y: 1.21, z: -0.14 }, materialType: 'glass' },
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: { x: 0.036, y: 0.34, z: 1.38 } }), position: { x: 0.84, y: 1.21, z: -0.14 }, materialType: 'glass' },
    ...wheelPositions.map(({ x, z }) => ({ desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: config.WHEELS.WIDTH, radius: config.WHEELS.RADIUS }), position: { x, y: config.WHEELS.RADIUS, z }, rotation: wheelRotation, materialType: 'rubber' })),
  ];
  const physics = physicsWorld.createStaticCompound(safePosition.x, groundY(), safePosition.z, compoundParts, rotationY);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics, mesh: view.root, name: 'car', rotationY, presentationTargets: view.targets,
  });
}
function addStreetLight(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const cfg = WORLD_CONFIG.OBJECTS.STREETLIGHT;
  const safe = clampToIsland(placement.x, placement.z, 0.8, 0.8);
  const view = new MapObjectView(sceneManager).streetLight({
    position: { x: safe.x, y: groundY(), z: safe.z },
  });
  const parts = [
    { desc: primitiveCollider(physicsWorld, { kind: 'box', size: cfg.BASE.SIZE }), position:{x:0,y:cfg.BASE.SIZE.y/2,z:0}, materialType:'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: cfg.POLE.HEIGHT, radius: cfg.POLE.RADIUS }), position:{x:0,y:cfg.POLE.HEIGHT/2+cfg.BASE.SIZE.y,z:0}, materialType:'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'cylinder', height: cfg.ARM.LENGTH, radius: cfg.ARM.RADIUS }), position:{x:cfg.ARM.LENGTH/2,y:cfg.POLE.HEIGHT+cfg.BASE.SIZE.y-0.12,z:0}, rotation:{x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}, materialType:'metal' },
    { desc: primitiveCollider(physicsWorld, { kind: 'sphere', radius: 0.14 }), position:{x:cfg.ARM.LENGTH,y:cfg.POLE.HEIGHT+cfg.BASE.SIZE.y-0.12,z:0}, materialType:'glass' },
  ];
  const physics = physicsWorld.createStaticCompound(safe.x, groundY(), safe.z, parts);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position:{x:safe.x,y:groundY(),z:safe.z}, physics, mesh:view.root, name:'streetlight', presentationTargets:view.targets
  });
}

function addDumpster(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const size = WORLD_CONFIG.OBJECTS.DUMPSTER.SIZE;
  const safe = clampToIsland(placement.x, placement.z, size.x/2, size.z/2);
  const view = new MapObjectView(sceneManager).dumpster({
    position: { x: safe.x, y: groundY(), z: safe.z },
  });
  const parts=[
    {desc:primitiveCollider(physicsWorld, { kind: 'box', size }),position:{x:0,y:size.y/2,z:0},materialType:'metal'},
    {desc:primitiveCollider(physicsWorld, { kind: 'box', size: { x: size.x + 0.04, y: 0.08, z: size.z + 0.04 } }),position:{x:0,y:size.y+0.04,z:0},materialType:'metal'},
  ];
  const physics=physicsWorld.createStaticCompound(safe.x,groundY(),safe.z,parts);
  return addSolidMapEntity(ecsWorld,physicsWorld,mapEntities,{
    position:{x:safe.x,y:groundY(),z:safe.z},physics,mesh:view.root,name:'dumpster',presentationTargets:view.targets
  });
}

function addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  const { WIDTH, LENGTH, BOUNDARY } = WORLD_CONFIG.MAP;
  const halfW = WIDTH / 2, halfL = LENGTH / 2;
  const { HEIGHT, THICKNESS } = BOUNDARY;
  const walls = [
    { x: 0, z: -halfL - THICKNESS / 2, size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS } },
    { x: 0, z: halfL + THICKNESS / 2, size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS } },
    { x: -halfW - THICKNESS / 2, z: 0, size: { x: THICKNESS, y: HEIGHT, z: LENGTH } },
    { x: halfW + THICKNESS / 2, z: 0, size: { x: THICKNESS, y: HEIGHT, z: LENGTH } },
  ];
  for (const wall of walls) {
    const physics = physicsWorld.createStaticBox(wall.x, groundY() + wall.size.y / 2, wall.z, wall.size.x / 2, wall.size.y / 2, wall.size.z / 2, 0, 'concrete');
    const view = new MapObjectView(sceneManager).boundary({ position: { x: wall.x, y: groundY(), z: wall.z }, size: wall.size });
    addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
      position: { x: wall.x, y: groundY(), z: wall.z }, physics, mesh: view.root, name: 'boundary', materialType: 'concrete', boundary: true,
    });
  }
}

function addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, position) {
  const config = WORLD_CONFIG.OBJECTS.MOUNTAIN;
  const safePosition = clampToIsland(position.x, position.z, config.RADIUS, config.RADIUS);
  const view = new MapObjectView(sceneManager).mountain({ position: { x: safePosition.x, y: groundY(), z: safePosition.z } });
  const physics = physicsWorld.createStaticCone(safePosition.x, groundY() + config.HEIGHT / 2, safePosition.z, config.RADIUS, config.HEIGHT, 0, 'stone');
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z }, physics, mesh: view.root, name: 'mountain', materialType: 'stone', presentationTargets: view.targets,
  });
}

function createMap(ecsWorld, physicsWorld, sceneManager, presentationColliderRegistry = null) {
  const mapEntities = [];
  mapEntities.presentationColliderRegistry = presentationColliderRegistry;
  const { WIDTH, LENGTH, FLOOR_THICKNESS } = WORLD_CONFIG.MAP;

  // Build the render surface before constructing the collider so the
  // presentation registry can bind the exact mesh target for bullet impact decals.
  const floorView = new MapObjectView(sceneManager).floor({
    position: { x: 0, y: groundY() - FLOOR_THICKNESS / 2, z: 0 },
    size: { x: WIDTH, y: FLOOR_THICKNESS, z: LENGTH },
    color: WORLD_CONFIG.COLORS.GROUND,
  });
  const floorPhysics = physicsWorld.createStaticBox(
    0,
    groundY() - FLOOR_THICKNESS / 2,
    0,
    WIDTH / 2,
    FLOOR_THICKNESS / 2,
    LENGTH / 2,
    0,
    'dirt'
  );

  addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: 0, y: groundY() - FLOOR_THICKNESS / 2, z: 0 },
    physics: floorPhysics,
    mesh: floorView.root,
    name: 'ground',
    materialType: 'dirt',
    presentationTargets: [floorView.root],
  });

  const safetyPhysics = physicsWorld.createWorldSafetyFloor();
  physicsWorld.registerColliderEntity(safetyPhysics.collider, mapEntities[0]);

  addPath(ecsWorld, physicsWorld, sceneManager, mapEntities);
  addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities);
  for (const p of WORLD_CONFIG.OBJECTS.STREETLIGHT.POSITIONS) addStreetLight(ecsWorld, physicsWorld, sceneManager, mapEntities, p);
  for (const p of WORLD_CONFIG.OBJECTS.DUMPSTER.POSITIONS) addDumpster(ecsWorld, physicsWorld, sceneManager, mapEntities, p);
  createUrbanObjects(ecsWorld, physicsWorld, sceneManager, mapEntities);

  for (const placement of WORLD_CONFIG.OBJECTS.CRATE.PLACEMENTS) {
    addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
      position: placement.position,
      size: placement.size,
      color: placement.color,
      name: 'crate',
    });
  }

  for (const position of WORLD_CONFIG.OBJECTS.TREE.POSITIONS) {
    addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, position);
  }

  for (const placement of WORLD_CONFIG.OBJECTS.CAR.PLACEMENTS) {
    addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, placement);
  }

  const barrier = WORLD_CONFIG.OBJECTS.BARRIER;
  for (const x of barrier.POSITIONS_X) {
    addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
      position: { x, z: barrier.Z },
      size: barrier.SIZE,
      color: barrier.COLOR,
      name: 'barrier',
      materialType: 'concrete',
    });
  }

  for (const position of WORLD_CONFIG.OBJECTS.MOUNTAIN.POSITIONS) {
    addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, position);
  }

  return mapEntities;
}
