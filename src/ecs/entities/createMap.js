// src/ecs/entities/createMap.js

import RAPIER from '@dimforge/rapier3d-compat';

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { WORLD_CONFIG } from '../../config/index.js';
import { createUrbanObjects } from './createUrbanObjects.js';
import { addSolidMapEntity } from './MapEntityAssembler.js';

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

function addStaticBox(ecsWorld, physicsWorld, sceneManager, mapEntities, {
  position,
  size,
  color,
  roughness = 0.7,
  name = 'box',
  rotationY = 0,
  materialType = 'wood',
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
  root.position.set(safePosition.x, groundY(), safePosition.z);
  root.rotation.y = rotationY;

  const physics = physicsWorld.createStaticBox(
    safePosition.x,
    groundY() + size.y / 2,
    safePosition.z,
    size.x / 2,
    size.y / 2,
    size.z / 2,
    rotationY,
    materialType
  );

  addToScene(sceneManager, root);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: root,
    name,
    presentationTargets: [mesh],
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
  group.position.set(safePosition.x, groundY(), safePosition.z);

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

  const presentationTargets = [trunk];
  const compoundParts = [
    {
      desc: RAPIER.ColliderDesc.cylinder(
        config.TRUNK.HEIGHT / 2,
        config.TRUNK.RADIUS
      ),
      position: {
        x: 0,
        y: config.TRUNK.HEIGHT / 2,
        z: 0,
      },
      materialType: 'wood',
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
      desc: RAPIER.ColliderDesc.cone(config.CANOPY.HEIGHT / 2, radius),
      position: { x: 0, y: centerY, z: 0 },
      materialType: 'foliage',
    });
    presentationTargets.push(cone);
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
    presentationTargets,
  });

  entity.isTree = true;
  return entity;
}

function addCar(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const config = WORLD_CONFIG.OBJECTS.CAR;
  const half = {
    x: config.COLLIDER.BOUNDS.x / 2,
    z: config.COLLIDER.BOUNDS.z / 2,
  };
  const safePosition = clampToIsland(placement.x, placement.z, half.x, half.z);

  const group = new THREE.Group();
  group.name = 'DetailedCar';
  group.position.set(safePosition.x, groundY(), safePosition.z);
  group.rotation.y = placement.rotationY || 0;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: placement.color,
    metalness: 0.55,
    roughness: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181b, metalness: 0.35, roughness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x18384a,
    metalness: 0.2,
    roughness: 0.18,
    transparent: true,
    opacity: 0.72,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, metalness: 0.9, roughness: 0.2 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff0bd, emissive: 0x66551f, emissiveIntensity: 1.5 });
  const redLightMat = new THREE.MeshStandardMaterial({ color: 0x8e1717, emissive: 0x3d0505, emissiveIntensity: 1.2 });

  const addBox = (size, pos, mat, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    m.name = name;
    m.position.set(pos.x, pos.y, pos.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const body = addBox(config.BODY.SIZE, { x: 0, y: config.BODY.CENTER_Y, z: 0 }, bodyMat, 'carBody');
  const hood = addBox({ x: 1.82, y: 0.16, z: 0.9 }, { x: 0, y: 0.79, z: -1.38 }, bodyMat, 'hood');
  const trunk = addBox({ x: 1.82, y: 0.15, z: 0.65 }, { x: 0, y: 0.76, z: 1.35 }, bodyMat, 'trunk');
  const cabin = addBox(config.CABIN.SIZE, { x: 0, y: config.CABIN.CENTER_Y, z: config.CABIN.CENTER_Z }, darkMat, 'cabinFrame');

  // Four separate glass panels make the silhouette read as a real road car.
  addBox({ x: 1.48, y: 0.38, z: 0.035 }, { x: 0, y: 1.22, z: -1.01 }, glassMat, 'windshield');
  addBox({ x: 1.48, y: 0.36, z: 0.035 }, { x: 0, y: 1.21, z: 0.72 }, glassMat, 'rearWindow');
  addBox({ x: 0.035, y: 0.34, z: 1.38 }, { x: -0.84, y: 1.21, z: -0.14 }, glassMat, 'leftWindow');
  addBox({ x: 0.035, y: 0.34, z: 1.38 }, { x: 0.84, y: 1.21, z: -0.14 }, glassMat, 'rightWindow');

  const bumperFront = addBox({ x: 1.95, y: 0.18, z: 0.14 }, { x: 0, y: 0.43, z: -1.93 }, chromeMat, 'frontBumper');
  const bumperRear = addBox({ x: 1.95, y: 0.18, z: 0.14 }, { x: 0, y: 0.43, z: 1.93 }, chromeMat, 'rearBumper');
  bumperFront.castShadow = bumperRear.castShadow = true;

  addBox({ x: 0.36, y: 0.18, z: 0.06 }, { x: -0.63, y: 0.72, z: -1.94 }, lightMat, 'headlightL');
  addBox({ x: 0.36, y: 0.18, z: 0.06 }, { x: 0.63, y: 0.72, z: -1.94 }, lightMat, 'headlightR');
  addBox({ x: 0.36, y: 0.16, z: 0.06 }, { x: -0.63, y: 0.72, z: 1.94 }, redLightMat, 'tailLightL');
  addBox({ x: 0.36, y: 0.16, z: 0.06 }, { x: 0.63, y: 0.72, z: 1.94 }, redLightMat, 'tailLightR');

  const mirrorGeo = new THREE.BoxGeometry(0.12, 0.09, 0.22);
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(mirrorGeo, darkMat);
    mirror.position.set(side * 1.02, 1.13, -0.38);
    mirror.castShadow = true;
    group.add(mirror);
  }

  const wheelMat = new THREE.MeshStandardMaterial({ color: config.COLORS.WHEEL, roughness: 0.88, metalness: 0.08 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x858b91, metalness: 0.85, roughness: 0.22 });
  const wheelGeo = new THREE.CylinderGeometry(config.WHEELS.RADIUS, config.WHEELS.RADIUS, config.WHEELS.WIDTH, config.WHEELS.RADIAL_SEGMENTS);
  const wheelPositions = [
    { x: config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
    { x: config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
    { x: -config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
  ];
  const wheelMeshes = [];
  for (const { x, z } of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, config.WHEELS.RADIUS, z);
    wheel.castShadow = true;
    group.add(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, config.WHEELS.WIDTH + 0.015, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.copy(wheel.position);
    group.add(rim);
    wheelMeshes.push(wheel);
  }

  const wheelRotation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  const windshield = group.children.find((child) => child.name === 'windshield');
  const rearWindow = group.children.find((child) => child.name === 'rearWindow');
  const leftWindow = group.children.find((child) => child.name === 'leftWindow');
  const rightWindow = group.children.find((child) => child.name === 'rightWindow');

  const presentationTargets = [body, hood, trunk, cabin, windshield, rearWindow, leftWindow, rightWindow, ...wheelMeshes];
  const compoundParts = [
    { desc: RAPIER.ColliderDesc.cuboid(config.BODY.SIZE.x / 2, config.BODY.SIZE.y / 2, config.BODY.SIZE.z / 2), position: { x: 0, y: config.BODY.CENTER_Y, z: 0 }, materialType: 'metal' },
    { desc: RAPIER.ColliderDesc.cuboid(0.91, 0.08, 0.45), position: { x: 0, y: 0.79, z: -1.38 }, materialType: 'metal' },
    { desc: RAPIER.ColliderDesc.cuboid(0.91, 0.075, 0.325), position: { x: 0, y: 0.76, z: 1.35 }, materialType: 'metal' },
    { desc: RAPIER.ColliderDesc.cuboid(config.CABIN.SIZE.x / 2, config.CABIN.SIZE.y / 2, config.CABIN.SIZE.z / 2), position: { x: 0, y: config.CABIN.CENTER_Y, z: config.CABIN.CENTER_Z }, materialType: 'metal' },
    { desc: RAPIER.ColliderDesc.cuboid(0.74, 0.19, 0.018), position: { x: 0, y: 1.22, z: -1.01 }, materialType: 'glass' },
    { desc: RAPIER.ColliderDesc.cuboid(0.74, 0.18, 0.018), position: { x: 0, y: 1.21, z: 0.72 }, materialType: 'glass' },
    { desc: RAPIER.ColliderDesc.cuboid(0.018, 0.17, 0.69), position: { x: -0.84, y: 1.21, z: -0.14 }, materialType: 'glass' },
    { desc: RAPIER.ColliderDesc.cuboid(0.018, 0.17, 0.69), position: { x: 0.84, y: 1.21, z: -0.14 }, materialType: 'glass' },
    ...wheelPositions.map(({ x, z }, index) => ({
      desc: RAPIER.ColliderDesc.cylinder(config.WHEELS.WIDTH / 2, config.WHEELS.RADIUS),
      position: { x, y: config.WHEELS.RADIUS, z },
      rotation: wheelRotation,
      materialType: 'rubber',
    })),
  ];

  const physics = physicsWorld.createStaticCompound(
    safePosition.x, groundY(), safePosition.z, compoundParts, placement.rotationY || 0
  );
  addToScene(sceneManager, group);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: group,
    name: 'car',
    rotationY: placement.rotationY || 0,
    presentationTargets,
  });
}
function addStreetLight(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const cfg = WORLD_CONFIG.OBJECTS.STREETLIGHT;
  const safe = clampToIsland(placement.x, placement.z, 0.8, 0.8);
  const group = new THREE.Group();
  group.position.set(safe.x, groundY(), safe.z);

  const metal = new THREE.MeshStandardMaterial({ color: 0x34383c, metalness: 0.75, roughness: 0.35 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe7a3, emissive: 0x6b5420, emissiveIntensity: 1.8 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(cfg.BASE.SIZE.x, cfg.BASE.SIZE.y, cfg.BASE.SIZE.z), metal);
  base.position.y = cfg.BASE.SIZE.y / 2;
  base.castShadow = true; base.receiveShadow = true; group.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(cfg.POLE.RADIUS, cfg.POLE.RADIUS * 1.15, cfg.POLE.HEIGHT, 12), metal);
  pole.position.y = cfg.POLE.HEIGHT / 2 + cfg.BASE.SIZE.y;
  pole.castShadow = true; pole.receiveShadow = true; group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(cfg.ARM.RADIUS, cfg.ARM.RADIUS, cfg.ARM.LENGTH, 10), metal);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(cfg.ARM.LENGTH / 2, cfg.POLE.HEIGHT + cfg.BASE.SIZE.y - 0.12, 0);
  arm.castShadow = true; group.add(arm);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), lampMat);
  lamp.position.set(cfg.ARM.LENGTH, cfg.POLE.HEIGHT + cfg.BASE.SIZE.y - 0.12, 0);
  group.add(lamp);

  const presentationTargets = [base, pole, arm, lamp];
  const parts = [
    { desc: RAPIER.ColliderDesc.cuboid(cfg.BASE.SIZE.x/2, cfg.BASE.SIZE.y/2, cfg.BASE.SIZE.z/2), position:{x:0,y:cfg.BASE.SIZE.y/2,z:0}, materialType:'metal' },
    { desc: RAPIER.ColliderDesc.cylinder(cfg.POLE.HEIGHT/2, cfg.POLE.RADIUS), position:{x:0,y:cfg.POLE.HEIGHT/2+cfg.BASE.SIZE.y,z:0}, materialType:'metal' },
    { desc: RAPIER.ColliderDesc.cylinder(cfg.ARM.LENGTH/2, cfg.ARM.RADIUS), position:{x:cfg.ARM.LENGTH/2,y:cfg.POLE.HEIGHT+cfg.BASE.SIZE.y-0.12,z:0}, rotation:{x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}, materialType:'metal' },
    { desc: RAPIER.ColliderDesc.ball(0.14), position:{x:cfg.ARM.LENGTH,y:cfg.POLE.HEIGHT+cfg.BASE.SIZE.y-0.12,z:0}, materialType:'glass' },
  ];
  const physics = physicsWorld.createStaticCompound(safe.x, groundY(), safe.z, parts);
  addToScene(sceneManager, group);
  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position:{x:safe.x,y:groundY(),z:safe.z}, physics, mesh:group, name:'streetlight', presentationTargets
  });
}

function addDumpster(ecsWorld, physicsWorld, sceneManager, mapEntities, placement) {
  const size = WORLD_CONFIG.OBJECTS.DUMPSTER.SIZE;
  const safe = clampToIsland(placement.x, placement.z, size.x/2, size.z/2);
  const group = new THREE.Group();
  group.position.set(safe.x, groundY(), safe.z);
  const bodyMat = new THREE.MeshStandardMaterial({ color:0x3f5149, metalness:0.35, roughness:0.65 });
  const lidMat = new THREE.MeshStandardMaterial({ color:0x26342f, metalness:0.45, roughness:0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z), bodyMat);
  body.position.y=size.y/2; body.castShadow=true; body.receiveShadow=true; group.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(size.x+0.04,0.08,size.z+0.04),lidMat);
  lid.position.set(0,size.y+0.04,0); lid.castShadow=true; group.add(lid);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.06,0.08),lidMat);
  handle.position.set(0,size.y+0.12,size.z/2+0.04); group.add(handle);
  const presentationTargets=[body,lid];
  const parts=[
    {desc:RAPIER.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2),position:{x:0,y:size.y/2,z:0},materialType:'metal'},
    {desc:RAPIER.ColliderDesc.cuboid((size.x+0.04)/2,0.04,(size.z+0.04)/2),position:{x:0,y:size.y+0.04,z:0},materialType:'metal'},
  ];
  const physics=physicsWorld.createStaticCompound(safe.x,groundY(),safe.z,parts);
  addToScene(sceneManager,group);
  return addSolidMapEntity(ecsWorld,physicsWorld,mapEntities,{position:{x:safe.x,y:groundY(),z:safe.z},physics,mesh:group,name:'dumpster',presentationTargets});
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
      wall.size.z / 2,
      0,
      'concrete'
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
      materialType: 'concrete',
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
  group.position.set(safePosition.x, groundY(), safePosition.z);
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
    config.HEIGHT,
    0,
    'stone'
  );

  return addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: safePosition.x, y: groundY(), z: safePosition.z },
    physics,
    mesh: group,
    name: 'mountain',
    materialType: 'stone',
    presentationTargets: [mesh],
  });
}

function addPath(ecsWorld, physicsWorld, sceneManager, mapEntities) {
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

    const physics = physicsWorld.createStaticBox(
      0,
      groundY() + THICKNESS / 2,
      0,
      size.x / 2,
      THICKNESS / 2,
      size.z / 2,
      0,
      'concrete'
    );
    addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
      position: { x: 0, y: groundY() + THICKNESS / 2, z: 0 },
      physics,
      mesh: path,
      name: 'path',
      materialType: 'concrete',
      presentationTargets: [path],
    });
  }
}

export function createMap(ecsWorld, physicsWorld, sceneManager, presentationColliderRegistry = null) {
  const mapEntities = [];
  mapEntities.presentationColliderRegistry = presentationColliderRegistry;
  const { WIDTH, LENGTH, FLOOR_THICKNESS } = WORLD_CONFIG.MAP;

  // Build the render surface before constructing the collider so the
  // presentation registry can bind the exact mesh target for bullet impact decals.
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH, FLOOR_THICKNESS, LENGTH),
    new THREE.MeshStandardMaterial({
      color: WORLD_CONFIG.COLORS.GROUND,
      roughness: 0.95,
    })
  );
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
  floorMesh.position.y = groundY() - FLOOR_THICKNESS / 2;
  floorMesh.receiveShadow = true;

  addSolidMapEntity(ecsWorld, physicsWorld, mapEntities, {
    position: { x: 0, y: groundY() - FLOOR_THICKNESS / 2, z: 0 },
    physics: floorPhysics,
    mesh: floorMesh,
    name: 'ground',
    materialType: 'dirt',
    presentationTargets: [floorMesh],
  });
  addToScene(sceneManager, floorMesh);

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
