// src/ecs/entities/createUrbanObjects.js
//
// Deterministic civilian/urban props. Every visible solid part is paired with
// the same Rapier primitive and the exact mesh is registered as the hit target.
// This keeps visual geometry and bullet collision geometry in one definition.

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { WORLD_CONFIG } from '../../config/index.js';
import { generateObjectPlacements } from '../../config/index.js';

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

function groundY() { return WORLD_CONFIG.GROUND_Y; }
function addToScene(sceneManager, object) { sceneManager?.scene?.add(object); }

function primitiveMesh(part) {
  let geometry;
  if (part.kind === 'box') {
    geometry = new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z);
  } else if (part.kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(part.radius, part.radius * (part.taper ?? 1), part.height, part.segments ?? 12);
  } else if (part.kind === 'cone') {
    geometry = new THREE.ConeGeometry(part.radius, part.height, part.segments ?? 12);
  } else {
    geometry = new THREE.SphereGeometry(part.radius, part.segments ?? 12, Math.max(6, Math.floor((part.segments ?? 12) * 0.65)));
  }
  const mesh = new THREE.Mesh(geometry, part.material || MAT.metal);
  mesh.position.set(part.position?.x || 0, part.position?.y || 0, part.position?.z || 0);
  mesh.rotation.set(part.rotation?.x || 0, part.rotation?.y || 0, part.rotation?.z || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = part.name;
  return mesh;
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
  const root = new THREE.Group();
  root.name = spec.name;
  root.position.set(spec.x, groundY(), spec.z);
  root.rotation.y = spec.rotationY || 0;

  const parts = spec.parts.map((part) => {
    const mesh = primitiveMesh(part);
    root.add(mesh);
    return { desc: primitiveCollider(part), renderTarget: mesh };
  });

  addToScene(sceneManager, root);
  const physics = physicsWorld.createStaticCompound(spec.x, groundY(), spec.z, parts, spec.rotationY || 0);
  const entity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    isUrbanObject: true,
    urbanType: spec.type,
    transform: createTransform(spec.x, groundY(), spec.z, spec.rotationY || 0),
    physics: {
      ...createPhysics(physics.body, physics.collider),
      colliders: physics.colliders,
    },
    renderMesh: { mesh: root },
  });

  for (let i = 0; i < physics.colliders.length; i++) {
    physicsWorld.registerColliderEntity(
      physics.colliders[i],
      entity,
      physics.colliderTargets?.[i] || null
    );
  }
  mapEntities.push(entity);
  return entity;
}

const qZ90 = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };

function box(name, size, position, material, extra = {}) {
  return { kind: 'box', name, size, position, material, ...extra };
}
function cyl(name, radius, height, position, material, extra = {}) {
  return { kind: 'cylinder', name, radius, height, position, material, ...extra };
}
function cone(name, radius, height, position, material, extra = {}) {
  return { kind: 'cone', name, radius, height, position, material, ...extra };
}
function sphere(name, radius, position, material, extra = {}) {
  return { kind: 'sphere', name, radius, position, material, ...extra };
}

export const URBAN_PROP_LIBRARY = [
  { type:'bench', name:'UrbanBench', x:-19, z:-10, parts:[
    box('seat',{x:1.8,y:.14,z:.46},{x:0,y:.72,z:0},MAT.wood),
    box('back',{x:1.8,y:.62,z:.12},{x:0,y:1.02,z:.16},MAT.wood),
    box('legL',{x:.12,y:.68,z:.12},{x:-.68,y:.34,z:0},MAT.metal),
    box('legR',{x:.12,y:.68,z:.12},{x:.68,y:.34,z:0},MAT.metal),
  ]},
  { type:'fire_hydrant', name:'FireHydrant', x:19, z:-10, parts:[
    cyl('body',.18,.72,{x:0,y:.36,z:0},MAT.red,{segments:12}),
    cyl('cap',.24,.10,{x:0,y:.77,z:0},MAT.red,{segments:12}),
    cyl('sideL',.11,.20,{x:-.20,y:.48,z:0},MAT.red,{segments:10,rotationQuaternion:qZ90}),
    cyl('sideR',.11,.20,{x:.20,y:.48,z:0},MAT.red,{segments:10,rotationQuaternion:qZ90}),
  ]},
  { type:'traffic_cone', name:'TrafficCone', x:-10, z:-18, parts:[
    cone('cone',.25,.62,{x:0,y:.31,z:0},MAT.yellow,{segments:16}),
    box('base',{x:.62,y:.07,z:.62},{x:0,y:.035,z:0},MAT.rubber),
    box('band',{x:.21,y:.07,z:.21},{x:0,y:.43,z:0},MAT.glass),
  ]},
  { type:'road_sign', name:'RoadSign', x:10, z:-22, parts:[
    cyl('post',.055,1.8,{x:0,y:.9,z:0},MAT.galvanized,{segments:10}),
    box('sign',{x:.72,y:.52,z:.07},{x:0,y:1.55,z:0},MAT.galvanized),
    box('face',{x:.56,y:.36,z:.012},{x:0,y:1.55,z:-.041},MAT.painted),
  ]},
  { type:'mailbox', name:'Mailbox', x:-24, z:-4, parts:[
    box('post',{x:.12,y:.8,z:.12},{x:0,y:.4,z:0},MAT.wood),
    box('box',{x:.55,y:.42,z:.38},{x:0,y:.88,z:0},MAT.galvanized),
    cyl('roof',.19,.55,{x:0,y:1.10,z:0},MAT.galvanized,{segments:16,rotationQuaternion:qZ90}),
    box('flag',{x:.035,y:.42,z:.035},{x:.31,y:.93,z:0},MAT.red),
  ]},
  { type:'utility_box', name:'UtilityCabinet', x:24, z:4, parts:[
    box('cabinet',{x:1.0,y:1.15,z:.62},{x:0,y:.575,z:0},MAT.galvanized),
    box('door',{x:.78,y:.86,z:.035},{x:0,y:.57,z:-.328},MAT.painted),
    cyl('handle',.025,.10,{x:.29,y:.57,z:-.36},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
  ]},
  { type:'phone_booth', name:'PhoneBooth', x:-24, z:4, parts:[
    box('rear',{x:1.0,y:2.05,z:.12},{x:0,y:1.025,z:.45},MAT.metal),
    box('left',{x:.10,y:2.05,z:1.0},{x:-.45,y:1.025,z:0},MAT.metal),
    box('right',{x:.10,y:2.05,z:1.0},{x:.45,y:1.025,z:0},MAT.metal),
    box('glass',{x:.72,y:1.55,z:.035},{x:0,y:1.20,z:-.47},MAT.glass),
    box('roof',{x:1.08,y:.12,z:1.08},{x:0,y:2.08,z:0},MAT.metal),
  ]},
  { type:'bus_stop', name:'BusStop', x:24, z:-4, parts:[
    box('postL',{x:.10,y:2.1,z:.10},{x:-.72,y:1.05,z:0},MAT.metal),
    box('postR',{x:.10,y:2.1,z:.10},{x:.72,y:1.05,z:0},MAT.metal),
    box('roof',{x:1.7,y:.12,z:.75},{x:0,y:2.12,z:0},MAT.metal),
    box('glass',{x:1.45,y:1.15,z:.035},{x:0,y:1.10,z:.34},MAT.glass),
    box('seat',{x:1.3,y:.12,z:.40},{x:0,y:.68,z:-.12},MAT.wood),
  ]},
  { type:'trash_can', name:'TrashCan', x:-14, z:-4, parts:[
    cyl('bin',.34,.72,{x:0,y:.36,z:0},MAT.metal,{segments:16,taper:.86}),
    cyl('rim',.37,.08,{x:0,y:.75,z:0},MAT.galvanized,{segments:16}),
    box('lid',{x:.42,y:.05,z:.42},{x:0,y:.80,z:0},MAT.metal),
  ]},
  { type:'pallet_stack', name:'PalletStack', x:14, z:4, parts:[
    box('palletA',{x:1.3,y:.12,z:.9},{x:0,y:.06,z:0},MAT.wood),
    box('palletB',{x:1.3,y:.12,z:.9},{x:0,y:.68,z:0},MAT.wood),
    box('load',{x:1.05,y:.95,z:.68},{x:0,y:1.22,z:0},MAT.concrete),
  ]},
  { type:'concrete_barrier', name:'ConcreteBarrier', x:-4, z:22, parts:[
    box('base',{x:2.0,y:.38,z:.62},{x:0,y:.19,z:0},MAT.concrete),
    box('sloped',{x:1.55,y:.58,z:.48},{x:0,y:.62,z:0},MAT.darkConcrete),
    box('cap',{x:1.15,y:.10,z:.40},{x:0,y:.96,z:0},MAT.concrete),
  ]},
  { type:'bollards', name:'Bollards', x:4, z:22, parts:[
    cyl('left',.11,.85,{x:-.55,y:.425,z:0},MAT.metal,{segments:12}),
    cyl('right',.11,.85,{x:.55,y:.425,z:0},MAT.metal,{segments:12}),
    box('baseL',{x:.28,y:.10,z:.28},{x:-.55,y:.05,z:0},MAT.concrete),
    box('baseR',{x:.28,y:.10,z:.28},{x:.55,y:.05,z:0},MAT.concrete),
  ]},
  { type:'parking_meter', name:'ParkingMeter', x:-10, z:10, parts:[
    cyl('pole',.045,1.15,{x:0,y:.575,z:0},MAT.metal,{segments:10}),
    box('head',{x:.22,y:.34,z:.16},{x:0,y:1.20,z:0},MAT.galvanized),
    sphere('button',.035,{x:0,y:1.25,z:-.095},MAT.red,{segments:8}),
    box('base',{x:.32,y:.08,z:.32},{x:0,y:.04,z:0},MAT.concrete),
  ]},
  { type:'newspaper_box', name:'NewspaperBox', x:10, z:10, parts:[
    box('body',{x:.48,y:.72,z:.34},{x:0,y:.36,z:0},MAT.painted),
    box('door',{x:.40,y:.44,z:.035},{x:0,y:.38,z:-.19},MAT.glass),
    box('roof',{x:.54,y:.10,z:.40},{x:0,y:.77,z:0},MAT.metal),
    cyl('handle',.025,.10,{x:.17,y:.40,z:-.22},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
  ]},
  { type:'bike_rack', name:'BikeRack', x:-18, z:16, parts:[
    cyl('rail',.045,2.0,{x:0,y:.45,z:0},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
    cyl('legA',.045,.55,{x:-.70,y:.275,z:0},MAT.metal,{segments:8}),
    cyl('legB',.045,.55,{x:.70,y:.275,z:0},MAT.metal,{segments:8}),
    cyl('rail2',.045,2.0,{x:0,y:.45,z:.48},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
  ]},
  { type:'planter', name:'StreetPlanter', x:18, z:16, parts:[
    box('pot',{x:1.15,y:.62,z:.82},{x:0,y:.31,z:0},MAT.concrete),
    box('soil',{x:.92,y:.08,z:.62},{x:0,y:.66,z:0},MAT.darkConcrete),
    cyl('shrub',.36,.72,{x:0,y:1.02,z:0},MAT.painted,{segments:12,taper:.65}),
  ]},
  { type:'ac_unit', name:'AirConditioner', x:-25, z:20, parts:[
    box('housing',{x:1.15,y:.72,z:.62},{x:0,y:.36,z:0},MAT.galvanized),
    cyl('fan',.25,.08,{x:0,y:.40,z:-.34},MAT.darkConcrete,{segments:16,rotationQuaternion:qZ90}),
    box('top',{x:1.22,y:.08,z:.68},{x:0,y:.76,z:0},MAT.metal),
  ]},
  { type:'generator', name:'PortableGenerator', x:25, z:20, parts:[
    box('body',{x:1.15,y:.78,z:.72},{x:0,y:.39,z:0},MAT.metal),
    box('panel',{x:.48,y:.42,z:.035},{x:0,y:.43,z:-.38},MAT.painted),
    cyl('exhaust',.055,.42,{x:.36,y:.92,z:0},MAT.galvanized,{segments:8}),
    box('handle',{x:.10,y:.10,z:.86},{x:0,y:.98,z:0},MAT.metal),
  ]},
  { type:'construction_barrel', name:'ConstructionBarrel', x:-18, z:-20, parts:[
    cyl('barrel',.34,.82,{x:0,y:.41,z:0},MAT.yellow,{segments:16,taper:.92}),
    box('stripe',{x:.70,y:.12,z:.70},{x:0,y:.40,z:0},MAT.glass),
    box('top',{x:.38,y:.08,z:.38},{x:0,y:.86,z:0},MAT.rubber),
  ]},
  { type:'manhole', name:'ManholeAssembly', x:18, z:-20, parts:[
    cyl('rim',.65,.08,{x:0,y:.04,z:0},MAT.metal,{segments:24}),
    cyl('cover',.57,.10,{x:0,y:.09,z:0},MAT.darkConcrete,{segments:24}),
    cyl('hub',.09,.12,{x:0,y:.15,z:0},MAT.metal,{segments:12}),
  ]},
];

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
