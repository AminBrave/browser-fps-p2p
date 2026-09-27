// src/ecs/entities/createMap.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { WORLD_CONFIG } from '../../config/world.js';

function addToScene(sceneManager, object) {
  sceneManager?.scene?.add(object);
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

function groundCenterY(height) {
  return WORLD_CONFIG.GROUND_Y + height / 2;
}

function addSolidMapEntity(
  ecsWorld,
  physicsWorld,
  mapEntities,
  { x, y, z, physics, mesh, name, boundary = false, solid = true }
) {
  mesh.name = name || mesh.name || 'world-object';
  const entity = ecsWorld.add({
    isMap: true,
    isBoundary: boundary,
    isSolid: solid,
    transform: createTransform(x, y, z),
    physics: createPhysics(physics.body, physics.collider),
    renderMesh: { mesh },
  });

  physicsWorld.registerColliderEntity?.(physics.collider, entity);
  mapEntities.push(entity);
  return entity;
}

function addStaticBox(ecsWorld, physicsWorld, mapEntities, {
  position,
  size,
  color,
  roughness = 0.7,
  name = 'box',
  rotationY = 0,
  material = null,
}) {
  const safePosition = clampToIsland(
    position.x,
    position.z,
    size.x / 2,
    size.z / 2
  );
  const y = position.y ?? groundCenterY(size.y);

  const physics = physicsWorld.createStaticBox(
    safePosition.x,
    y,
    safePosition.z,
    size.x / 2,
    size.y / 2,
    size.z / 2,
    rotationY
  );

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    material || new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.05,
    })
  );
  mesh.position.set(safePosition.x, y, safePosition.z);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    x: safePosition.x,
    y,
    z: safePosition.z,
    physics,
    mesh,
    name,
  });
}

function addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, position) {
  const config = WORLD_CONFIG.OBJECTS.TREE;
  const safePosition = clampToIsland(
    position.x,
    position.z,
    config.CANOPY_RADIUS,
    config.CANOPY_RADIUS
  );
  const { TRUNK_HEIGHT, TRUNK_RADIUS, CANOPY_RADIUS, CANOPY_HEIGHT } = config;

  const group = new THREE.Group();
  group.position.set(safePosition.x, WORLD_CONFIG.GROUND_Y, safePosition.z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TRUNK_RADIUS * 0.75, TRUNK_RADIUS, TRUNK_HEIGHT, 8),
    new THREE.MeshStandardMaterial({
      color: WORLD_CONFIG.COLORS.TREE_TRUNK,
      roughness: 0.92,
    })
  );
  trunk.position.y = TRUNK_HEIGHT / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: WORLD_CONFIG.COLORS.TREE_CANOPY,
    roughness: 0.9,
  });

  for (let i = 0; i < config.CANOPY_LAYERS; i++) {
    const radius = CANOPY_RADIUS - i * 0.32;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 1.6, 8),
      leafMat
    );
    cone.position.y = TRUNK_HEIGHT * 0.5 + 0.7 + i * 0.85;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
  }

  addToScene(sceneManager, group);

  const trunkPhysics = physicsWorld.createStaticBox(
    safePosition.x,
    groundCenterY(TRUNK_HEIGHT),
    safePosition.z,
    TRUNK_RADIUS,
    TRUNK_HEIGHT / 2,
    TRUNK_RADIUS
  );
  const trunkEntity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    transform: createTransform(
      safePosition.x,
      groundCenterY(TRUNK_HEIGHT),
      safePosition.z
    ),
    physics: createPhysics(trunkPhysics.body, trunkPhysics.collider),
    renderMesh: { mesh: group },
  });
  physicsWorld.registerColliderEntity(trunkPhysics.collider, trunkEntity);
  mapEntities.push(trunkEntity);

  const canopyPhysics = physicsWorld.createStaticBox(
    safePosition.x,
    TRUNK_HEIGHT + 1,
    safePosition.z,
    CANOPY_RADIUS,
    CANOPY_HEIGHT,
    CANOPY_RADIUS
  );
  const canopyEntity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    transform: createTransform(
      safePosition.x,
      TRUNK_HEIGHT + 1,
      safePosition.z
    ),
    physics: createPhysics(canopyPhysics.body, canopyPhysics.collider),
    renderMesh: { mesh: new THREE.Object3D() },
  });
  physicsWorld.registerColliderEntity(canopyPhysics.collider, canopyEntity);
  mapEntities.push(canopyEntity);
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, config, color) {
  const { BODY, CABIN, WHEEL_RADIUS, WHEEL_WIDTH, WHEEL_OFFSET_X, WHEEL_OFFSET_Z } =
    WORLD_CONFIG.OBJECTS.CAR;
  const safePosition = clampToIsland(
    config.x,
    config.z,
    Math.max(BODY.x, CABIN.x) / 2,
    BODY.z / 2
  );

  const group = new THREE.Group();
  group.position.set(safePosition.x, WORLD_CONFIG.GROUND_Y, safePosition.z);
  group.rotation.y = config.rotationY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.5,
    roughness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BODY.x, BODY.y, BODY.z), bodyMat);
  body.position.y = WHEEL_RADIUS + 0.35;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(CABIN.x, CABIN.y, CABIN.z),
    new THREE.MeshStandardMaterial({
      color: WORLD_CONFIG.COLORS.CAR_CABIN,
      metalness: 0.25,
      roughness: 0.4,
    })
  );
  cabin.position.set(0, WHEEL_RADIUS + 0.85, -0.15);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.95,
  });
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 14);
  for (const [wx, wz] of [
    [WHEEL_OFFSET_X, WHEEL_OFFSET_Z],
    [-WHEEL_OFFSET_X, WHEEL_OFFSET_Z],
    [WHEEL_OFFSET_X, -WHEEL_OFFSET_Z],
    [-WHEEL_OFFSET_X, -WHEEL_OFFSET_Z],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, WHEEL_RADIUS, wz);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
  }

  addToScene(sceneManager, group);

  const colliderSize = WORLD_CONFIG.OBJECTS.CAR.BODY_COLLIDER;
  const bodyCenterY = groundCenterY(colliderSize.y);
  const physics = physicsWorld.createStaticBox(
    safePosition.x,
    bodyCenterY,
    safePosition.z,
    colliderSize.x / 2,
    colliderSize.y / 2,
    colliderSize.z / 2,
    config.rotationY
  );

  const entity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    transform: createTransform(safePosition.x, bodyCenterY, safePosition.z),
    physics: createPhysics(physics.body, physics.collider),
    renderMesh: { mesh: group },
  });
  physicsWorld.registerColliderEntity(physics.collider, entity);
  mapEntities.push(entity);
}

function addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  const { WIDTH, LENGTH, BOUNDARY } = WORLD_CONFIG.MAP;
  const halfW = WIDTH / 2;
  const halfL = LENGTH / 2;
  const { HEIGHT, THICKNESS } = BOUNDARY;

  const walls = [
    { x: 0, y: groundCenterY(HEIGHT), z: -halfL - THICKNESS / 2, size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS } },
    { x: 0, y: groundCenterY(HEIGHT), z: halfL + THICKNESS / 2, size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS } },
    { x: -halfW - THICKNESS / 2, y: groundCenterY(HEIGHT), z: 0, size: { x: THICKNESS, y: HEIGHT, z: LENGTH } },
    { x: halfW + THICKNESS / 2, y: groundCenterY(HEIGHT), z: 0, size: { x: THICKNESS, y: HEIGHT, z: LENGTH } },
  ];

  for (const wall of walls) {
    const physics = physicsWorld.createStaticBox(
      wall.x,
      wall.y,
      wall.z,
      wall.size.x / 2,
      wall.size.y / 2,
      wall.size.z / 2
    );
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(wall.size.x, wall.size.y, wall.size.z),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    mesh.position.set(wall.x, wall.y, wall.z);

    const entity = ecsWorld.add({
      isMap: true,
      isBoundary: true,
      isSolid: true,
      transform: createTransform(wall.x, wall.y, wall.z),
      physics: createPhysics(physics.body, physics.collider),
      renderMesh: { mesh },
    });
    physicsWorld.registerColliderEntity(physics.collider, entity);
    mapEntities.push(entity);
    addToScene(sceneManager, mesh);
  }
}

function addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, position) {
  const config = WORLD_CONFIG.OBJECTS.MOUNTAIN;
  const safePosition = clampToIsland(
    position.x,
    position.z,
    config.RADIUS,
    config.RADIUS
  );

  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(config.RADIUS, config.HEIGHT, config.SEGMENTS),
    new THREE.MeshStandardMaterial({
      color: WORLD_CONFIG.COLORS.MOUNTAIN,
      roughness: 1,
      flatShading: true,
    })
  );
  mesh.position.set(
    safePosition.x,
    WORLD_CONFIG.GROUND_Y + config.HEIGHT / 2,
    safePosition.z
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addToScene(sceneManager, mesh);

  // Rapier has a native solid cone collider, so bullets and players collide
  // with the actual mountain volume rather than a loose stack of boxes.
  const physics = physicsWorld.createStaticCone(
    safePosition.x,
    WORLD_CONFIG.GROUND_Y + config.HEIGHT / 2,
    safePosition.z,
    config.RADIUS,
    config.HEIGHT
  );

  const entity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    isMountain: true,
    transform: createTransform(
      safePosition.x,
      WORLD_CONFIG.GROUND_Y + config.HEIGHT / 2,
      safePosition.z
    ),
    physics: createPhysics(physics.body, physics.collider),
    renderMesh: { mesh },
  });
  physicsWorld.registerColliderEntity(physics.collider, entity);
  mapEntities.push(entity);
}

function addPath(sceneManager) {
  const { CENTER_WIDTH, ARM_LENGTH, THICKNESS, COLOR } = WORLD_CONFIG.OBJECTS.PATH;
  const material = new THREE.MeshStandardMaterial({ color: COLOR, roughness: 1 });

  for (const size of [
    { x: CENTER_WIDTH, z: ARM_LENGTH },
    { x: ARM_LENGTH, z: CENTER_WIDTH },
  ]) {
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, THICKNESS, size.z),
      material
    );
    path.position.set(
      0,
      WORLD_CONFIG.GROUND_Y + THICKNESS / 2,
      0
    );
    path.receiveShadow = true;
    addToScene(sceneManager, path);
  }
}

export function createMap(ecsWorld, physicsWorld, sceneManager) {
  const mapEntities = [];
  const { WIDTH, LENGTH, FLOOR_THICKNESS } = WORLD_CONFIG.MAP;
  const floorY = WORLD_CONFIG.GROUND_Y - FLOOR_THICKNESS / 2;

  const floorPhysics = physicsWorld.createStaticBox(
    0,
    floorY,
    0,
    WIDTH / 2,
    FLOOR_THICKNESS / 2,
    LENGTH / 2
  );
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH, FLOOR_THICKNESS, LENGTH),
    new THREE.MeshStandardMaterial({
      color: WORLD_CONFIG.COLORS.GROUND,
      roughness: 0.95,
    })
  );
  floorMesh.position.set(0, floorY, 0);
  floorMesh.receiveShadow = true;
  addToScene(sceneManager, floorMesh);

  const floorEntity = ecsWorld.add({
    isMap: true,
    isGround: true,
    isSolid: true,
    transform: createTransform(0, floorY, 0),
    physics: createPhysics(floorPhysics.body, floorPhysics.collider),
    renderMesh: { mesh: floorMesh },
  });
  physicsWorld.registerColliderEntity(floorPhysics.collider, floorEntity);
  mapEntities.push(floorEntity);

  // A shallow invisible catch floor is a last-resort containment layer if a
  // player ever bypasses the visible island boundaries.
  const safetyPhysics = physicsWorld.createWorldSafetyFloor();
  physicsWorld.registerColliderEntity(safetyPhysics.collider, floorEntity);

  addPath(sceneManager);

  addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities);

  const crateConfig = WORLD_CONFIG.OBJECTS.CRATE;
  for (let i = 0; i < crateConfig.POSITIONS.length; i++) {
    const size = crateConfig.SIZES[i];
    const position = crateConfig.POSITIONS[i];
    addStaticBox(ecsWorld, physicsWorld, mapEntities, {
      position,
      size,
      color: crateConfig.COLORS[i],
      name: 'crate',
    });
  }

  for (const position of WORLD_CONFIG.OBJECTS.TREE.POSITIONS) {
    const { WIDTH, LENGTH, OBJECT_PADDING } = WORLD_CONFIG.MAP;
    if (
      Math.abs(position.x) <= WIDTH / 2 - OBJECT_PADDING &&
      Math.abs(position.z) <= LENGTH / 2 - OBJECT_PADDING
    ) {
      addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, position);
    }
  }

  for (let i = 0; i < WORLD_CONFIG.OBJECTS.CAR.POSITIONS.length; i++) {
    const color = [0x2e86de, 0xee5a24, 0x10ac84][i % 3];
    addCar(
      ecsWorld,
      physicsWorld,
      sceneManager,
      mapEntities,
      WORLD_CONFIG.OBJECTS.CAR.POSITIONS[i],
      color
    );
  }

  const barrier = WORLD_CONFIG.OBJECTS.BARRIER;
  for (const x of barrier.POSITIONS_X) {
    addStaticBox(ecsWorld, physicsWorld, mapEntities, {
      position: { x, y: groundCenterY(barrier.SIZE.y), z: barrier.Z },
      size: barrier.SIZE,
      color: barrier.COLOR,
      name: 'barrier',
    });
  }

  for (const position of WORLD_CONFIG.OBJECTS.MOUNTAIN.POSITIONS) {
    addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, position);
  }

  return mapEntities;
}
