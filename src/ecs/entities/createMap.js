// src/ecs/entities/createMap.js

import RAPIER from '@dimforge/rapier3d-compat';

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

function groundY() {
  return WORLD_CONFIG.GROUND_Y;
}

function addSolidMapEntity(
  ecsWorld,
  physicsWorld,
  mapEntities,
  { position, physics, mesh, name, boundary = false, colliders = [] }
) {
  mesh.name = name || mesh.name || 'world-object';
  mesh.visible = !boundary;

  const entity = ecsWorld.add({
    isMap: true,
    isBoundary: boundary,
    isSolid: true,
    transform: createTransform(position.x, position.y, position.z),
    physics: {
      ...createPhysics(physics.body, physics.collider),
      colliders: [
        ...(physics.colliders || [physics.collider]),
        ...colliders,
      ],
    },
    renderMesh: { mesh },
  });

  for (const collider of physics.colliders || [physics.collider]) {
    physicsWorld.registerColliderEntity(collider, entity);
  }
  for (const collider of colliders) {
    physicsWorld.registerColliderEntity(collider, entity);
  }

  mapEntities.push(entity);
  return entity;
}

function addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
  position,
  size,
  color,
  roughness = 0.7,
  name = 'box',
  rotationY = 0,
}) {
  const safePosition = clampToIsland(
    position.x,
    position.z,
    size.x / 2,
    size.z / 2
  );

  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.05,
    })
  );
  mesh.position.y = size.y / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  root.rotation.y = rotationY;

  const physics = physicsWorld.createStaticBox(
    safePosition.x,
    groundY() + size.y / 2,
    safePosition.z,
    size.x / 2,
    size.y / 2,
    size.z / 2,
    rotationY
  );

  addToScene(sceneManager, root);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: root,
    name,
  });
}

function addTree(ecsWorld, physicsWorld, sceneManager, mapEntities, position) {
  const config = WORLD_CONFIG.OBJECTS.TREE;
  const safePosition = clampToIsland(
    position.x,
    position.z,
    config.CANOPY.BASE_RADIUS,
    config.CANOPY.BASE_RADIUS
  );

  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(
      config.TRUNK.RADIUS,
      config.TRUNK.RADIUS,
      config.TRUNK.HEIGHT,
      config.TRUNK.RADIAL_SEGMENTS
    ),
    new THREE.MeshStandardMaterial({
      color: config.COLORS.TRUNK,
      roughness: 0.92,
    })
  );
  trunk.position.y = config.TRUNK.HEIGHT / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: config.COLORS.CANOPY,
    roughness: 0.9,
  });

  const compoundParts = [
    {
      shape: new RAPIER.Cylinder(
        config.TRUNK.HEIGHT / 2,
        config.TRUNK.RADIUS
      ),
      position: {
        x: 0,
        y: config.TRUNK.HEIGHT / 2,
        z: 0,
      },
    },
  ];

  for (let i = 0; i < config.CANOPY.LAYERS; i++) {
    const radius = Math.max(
      0.05,
      config.CANOPY.BASE_RADIUS - i * config.CANOPY.RADIUS_STEP
    );
    const centerY =
      config.CANOPY.START_CENTER_Y + i * config.CANOPY.VERTICAL_STEP;

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(
        radius,
        config.CANOPY.HEIGHT,
        config.CANOPY.RADIAL_SEGMENTS
      ),
      leafMat
    );
    cone.position.y = centerY;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);

    compoundParts.push({
      shape: new RAPIER.Cone(config.CANOPY.HEIGHT / 2, radius),
      position: { x: 0, y: centerY, z: 0 },
    });
  }

  addToScene(sceneManager, group);

  const physics = physicsWorld.createStaticCompound(
    safePosition.x,
    groundY(),
    safePosition.z,
    compoundParts
  );

  const entity = addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: group,
    name: 'tree',
  });

  entity.isTree = true;
  return entity;
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const config = WORLD_CONFIG.OBJECTS.CAR;
  const safePosition = clampToIsland(
    placement.x,
    placement.z,
    config.COLLIDER.BOUNDS.x / 2,
    config.COLLIDER.BOUNDS.z / 2
  );

  const group = new THREE.Group();
  group.rotation.y = placement.rotationY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: placement.color,
    metalness: 0.5,
    roughness: 0.35,
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(
      config.BODY.SIZE.x,
      config.BODY.SIZE.y,
      config.BODY.SIZE.z
    ),
    bodyMat
  );
  body.position.y = config.BODY.CENTER_Y;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(
      config.CABIN.SIZE.x,
      config.CABIN.SIZE.y,
      config.CABIN.SIZE.z
    ),
    new THREE.MeshStandardMaterial({
      color: config.COLORS.CABIN,
      metalness: 0.25,
      roughness: 0.4,
    })
  );
  cabin.position.set(0, config.CABIN.CENTER_Y, config.CABIN.CENTER_Z);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({
    color: config.COLORS.WHEEL,
    roughness: 0.95,
  });
  const wheelGeo = new THREE.CylinderGeometry(
    config.WHEELS.RADIUS,
    config.WHEELS.RADIUS,
    config.WHEELS.WIDTH,
    config.WHEELS.RADIAL_SEGMENTS
  );

  const wheelPositions = [
    { x: config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
  ];

  for (const { x, z } of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, config.WHEELS.RADIUS, z);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
  }

  addToScene(sceneManager, group);

  const wheelRotation = {
    x: 0,
    y: 0,
    z: Math.SQRT1_2,
    w: Math.SQRT1_2,
  };

  // One car = one fixed rigid body + body/cabin/wheel child colliders.
  // The child transforms use the same local coordinates as the meshes.
  const compoundParts = [
    {
      shape: new RAPIER.Cuboid(
        config.BODY.SIZE.x / 2,
        config.BODY.SIZE.y / 2,
        config.BODY.SIZE.z / 2
      ),
      position: { x: 0, y: config.BODY.CENTER_Y, z: 0 },
    },
    {
      shape: new RAPIER.Cuboid(
        config.CABIN.SIZE.x / 2,
        config.CABIN.SIZE.y / 2,
        config.CABIN.SIZE.z / 2
      ),
      position: {
        x: 0,
        y: config.CABIN.CENTER_Y,
        z: config.CABIN.CENTER_Z,
      },
    },
    ...wheelPositions.map(({ x, z }) => ({
      shape: new RAPIER.Cylinder(
        config.WHEELS.WIDTH / 2,
        config.WHEELS.RADIUS
      ),
      position: { x, y: config.WHEELS.RADIUS, z },
      rotation: wheelRotation,
    })),
  ];

  const physics = physicsWorld.createStaticCompound(
    safePosition.x,
    groundY(),
    safePosition.z,
    compoundParts,
    placement.rotationY
  );

  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: group,
    name: 'car',
  });
}

function addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  const { WIDTH, LENGTH, BOUNDARY } = WORLD_CONFIG.MAP;
  const halfW = WIDTH / 2;
  const halfL = LENGTH / 2;
  const { HEIGHT, THICKNESS } = BOUNDARY;

  const walls = [
    {
      x: 0, z: -halfL - THICKNESS / 2,
      size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS },
    },
    {
      x: 0, z: halfL + THICKNESS / 2,
      size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS },
    },
    {
      x: -halfW - THICKNESS / 2, z: 0,
      size: { x: THICKNESS, y: HEIGHT, z: LENGTH },
    },
    {
      x: halfW + THICKNESS / 2, z: 0,
      size: { x: THICKNESS, y: HEIGHT, z: LENGTH },
    },
  ];

  for (const wall of walls) {
    const physics = physicsWorld.createStaticBox(
      wall.x,
      groundY() + wall.size.y / 2,
      wall.z,
      wall.size.x / 2,
      wall.size.y / 2,
      wall.size.z / 2
    );

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(wall.size.x, wall.size.y, wall.size.z),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    mesh.position.y = wall.size.y / 2;

    addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
      position: { x: wall.x, y: groundY(), z: wall.z },
      physics,
      mesh,
      name: 'boundary',
      boundary: true,
    });
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

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(
      config.RADIUS,
      config.HEIGHT,
      config.SEGMENTS
    ),
    new THREE.MeshStandardMaterial({
      color: WORLD_CONFIG.COLORS.MOUNTAIN,
      roughness: 1,
      flatShading: true,
    })
  );
  mesh.position.y = config.HEIGHT / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  addToScene(sceneManager, group);

  const physics = physicsWorld.createStaticCone(
    safePosition.x,
    groundY() + config.HEIGHT / 2,
    safePosition.z,
    config.RADIUS,
    config.HEIGHT
  );

  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: group,
    name: 'mountain',
  });
}

function addPath(sceneManager) {
  const { CENTER_WIDTH, ARM_LENGTH, THICKNESS, COLOR } =
    WORLD_CONFIG.OBJECTS.PATH;
  const material = new THREE.MeshStandardMaterial({ color: COLOR, roughness: 1 });

  for (const size of [
    { x: CENTER_WIDTH, z: ARM_LENGTH },
    { x: ARM_LENGTH, z: CENTER_WIDTH },
  ]) {
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, THICKNESS, size.z),
      material
    );
    path.position.set(0, groundY() + THICKNESS / 2, 0);
    path.receiveShadow = true;
    addToScene(sceneManager, path);
  }
}

export function createMap(ecsWorld, physicsWorld, sceneManager) {
  const mapEntities = [];
  const { WIDTH, LENGTH, FLOOR_THICKNESS } = WORLD_CONFIG.MAP;

  const floorPhysics = physicsWorld.createStaticBox(
    0,
    groundY() - FLOOR_THICKNESS / 2,
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
  floorMesh.position.y = -FLOOR_THICKNESS / 2;
  floorMesh.receiveShadow = true;

  addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: 0, y: groundY(), z: 0 },
    physics: floorPhysics,
    mesh: floorMesh,
    name: 'ground',
  });
  addToScene(sceneManager, floorMesh);

  const safetyPhysics = physicsWorld.createWorldSafetyFloor();
  physicsWorld.registerColliderEntity(safetyPhysics.collider, mapEntities[0]);

  addPath(sceneManager);
  addBoundaryWalls(ecsWorld, physicsWorld, sceneManager, mapEntities);

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
    });
  }

  for (const position of WORLD_CONFIG.OBJECTS.MOUNTAIN.POSITIONS) {
    addMountain(ecsWorld, physicsWorld, sceneManager, mapEntities, position);
  }

  return mapEntities;
}
