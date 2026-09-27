// src/ecs/entities/createUrbanObjects.js
//
// Deterministic civilian/urban props. Every visible solid part is paired with
// the same Rapier primitive and the exact mesh is registered as the hit target.
// This keeps visual geometry and bullet collision geometry in one definition.

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { WORLD_CONFIG } from '../../config/world.js';

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

const P = [
  { type:'bench', name:'UrbanBench', x:-19, z:-10, parts:[
    box('seat',{1.8,.14,.46},{x:0,y:.72,z:0},MAT.wood),
    box('back',{1.8,.62,.12},{x:0,y:1.02,z:.16},MAT.wood),
    box('legL',{.12,.68,.12},{x:-.68,y:.34,z:0},MAT.metal),
    box('legR',{.12,.68,.12},{x:.68,y:.34,z:0},MAT.metal),
  ]},
  { type:'fire_hydrant', name:'FireHydrant', x:19, z:-10, parts:[
    cyl('body',.18,.72,{x:0,y:.36,z:0},MAT.red,{segments:12}),
    cyl('cap',.24,.10,{x:0,y:.77,z:0},MAT.red,{segments:12}),
    cyl('sideL',.11,.20,{x:-.20,y:.48,z:0},MAT.red,{segments:10,rotationQuaternion:qZ90}),
    cyl('sideR',.11,.20,{x:.20,y:.48,z:0},MAT.red,{segments:10,rotationQuaternion:qZ90}),
  ]},
  { type:'traffic_cone', name:'TrafficCone', x:-10, z:-18, parts:[
    cone('cone',.25,.62,{x:0,y:.31,z:0},MAT.yellow,{segments:16}),
    box('base',{.62,.07,.62},{x:0,y:.035,z:0},MAT.rubber),
    box('band',{.21,.07,.21},{x:0,y:.43,z:0},MAT.glass),
  ]},
  { type:'road_sign', name:'RoadSign', x:10, z:-18, parts:[
    cyl('post',.055,1.8,{x:0,y:.9,z:0},MAT.galvanized,{segments:10}),
    box('sign',{.72,.52,.07},{x:0,y:1.55,z:0},MAT.galvanized),
    box('face',{.56,.36,.012},{x:0,y:1.55,z:-.041},MAT.painted),
  ]},
  { type:'mailbox', name:'Mailbox', x:-24, z:-4, parts:[
    box('post',{.12,.8,.12},{x:0,y:.4,z:0},MAT.wood),
    box('box',{.55,.42,.38},{x:0,y:.88,z:0},MAT.galvanized),
    cyl('roof',.19,.55,{x:0,y:1.10,z:0},MAT.galvanized,{segments:16,rotationQuaternion:qZ90}),
    box('flag',{.035,.42,.035},{x:.31,y:.93,z:0},MAT.red),
  ]},
  { type:'utility_box', name:'UtilityCabinet', x:24, z:4, parts:[
    box('cabinet',{1.0,1.15,.62},{x:0,y:.575,z:0},MAT.galvanized),
    box('door',{.78,.86,.035},{x:0,y:.57,z:-.328},MAT.painted),
    cyl('handle',.025,.10,{x:.29,y:.57,z:-.36},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
  ]},
  { type:'phone_booth', name:'PhoneBooth', x:-24, z:4, parts:[
    box('rear',{1.0,2.05,.12},{x:0,y:1.025,z:.45},MAT.metal),
    box('left',{.10,2.05,1.0},{x:-.45,y:1.025,z:0},MAT.metal),
    box('right',{.10,2.05,1.0},{x:.45,y:1.025,z:0},MAT.metal),
    box('glass',{.72,1.55,.035},{x:0,y:1.20,z:-.47},MAT.glass),
    box('roof',{1.08,.12,1.08},{x:0,y:2.08,z:0},MAT.metal),
  ]},
  { type:'bus_stop', name:'BusStop', x:24, z:-4, parts:[
    box('postL',{.10,2.1,.10},{x:-.72,y:1.05,z:0},MAT.metal),
    box('postR',{.10,2.1,.10},{x:.72,y:1.05,z:0},MAT.metal),
    box('roof',{1.7,.12,.75},{x:0,y:2.12,z:0},MAT.metal),
    box('glass',{1.45,1.15,.035},{x:0,y:1.10,z:.34},MAT.glass),
    box('seat',{1.3,.12,.40},{x:0,y:.68,z:-.12},MAT.wood),
  ]},
  { type:'trash_can', name:'TrashCan', x:-14, z:-4, parts:[
    cyl('bin',.34,.72,{x:0,y:.36,z:0},MAT.metal,{segments:16,taper:.86}),
    cyl('rim',.37,.08,{x:0,y:.75,z:0},MAT.galvanized,{segments:16}),
    box('lid',{.42,.05,.42},{x:0,y:.80,z:0},MAT.metal),
  ]},
  { type:'pallet_stack', name:'PalletStack', x:14, z:4, parts:[
    box('palletA',{1.3,.12,.9},{x:0,y:.06,z:0},MAT.wood),
    box('palletB',{1.3,.12,.9},{x:0,y:.68,z:0},MAT.wood),
    box('load',{1.05,.95,.68},{x:0,y:1.22,z:0},MAT.concrete),
  ]},
  { type:'concrete_barrier', name:'ConcreteBarrier', x:-4, z:22, parts:[
    box('base',{2.0,.38,.62},{x:0,y:.19,z:0},MAT.concrete),
    box('sloped',{1.55,.58,.48},{x:0,y:.62,z:0},MAT.darkConcrete),
    box('cap',{1.15,.10,.40},{x:0,y:.96,z:0},MAT.concrete),
  ]},
  { type:'bollards', name:'Bollards', x:4, z:22, parts:[
    cyl('left',.11,.85,{x:-.55,y:.425,z:0},MAT.metal,{segments:12}),
    cyl('right',.11,.85,{x:.55,y:.425,z:0},MAT.metal,{segments:12}),
    box('baseL',{.28,.10,.28},{x:-.55,y:.05,z:0},MAT.concrete),
    box('baseR',{.28,.10,.28},{x:.55,y:.05,z:0},MAT.concrete),
  ]},
  { type:'parking_meter', name:'ParkingMeter', x:-10, z:10, parts:[
    cyl('pole',.045,1.15,{x:0,y:.575,z:0},MAT.metal,{segments:10}),
    box('head',{.22,.34,.16},{x:0,y:1.20,z:0},MAT.galvanized),
    sphere('button',.035,{x:0,y:1.25,z:-.095},MAT.red,{segments:8}),
    box('base',{.32,.08,.32},{x:0,y:.04,z:0},MAT.concrete),
  ]},
  { type:'newspaper_box', name:'NewspaperBox', x:10, z:10, parts:[
    box('body',{.48,.72,.34},{x:0,y:.36,z:0},MAT.painted),
    box('door',{.40,.44,.035},{x:0,y:.38,z:-.19},MAT.glass),
    box('roof',{.54,.10,.40},{x:0,y:.77,z:0},MAT.metal),
    cyl('handle',.025,.10,{x:.17,y:.40,z:-.22},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
  ]},
  { type:'bike_rack', name:'BikeRack', x:-18, z:16, parts:[
    cyl('rail',.045,2.0,{x:0,y:.45,z:0},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
    cyl('legA',.045,.55,{x:-.70,y:.275,z:0},MAT.metal,{segments:8}),
    cyl('legB',.045,.55,{x:.70,y:.275,z:0},MAT.metal,{segments:8}),
    cyl('rail2',.045,2.0,{x:0,y:.45,z:.48},MAT.metal,{segments:8,rotationQuaternion:qZ90}),
  ]},
  { type:'planter', name:'StreetPlanter', x:18, z:16, parts:[
    box('pot',{1.15,.62,.82},{x:0,y:.31,z:0},MAT.concrete),
    box('soil',{.92,.08,.62},{x:0,y:.66,z:0},MAT.darkConcrete),
    cyl('shrub',.36,.72,{x:0,y:1.02,z:0},MAT.painted,{segments:12,taper:.65}),
  ]},
  { type:'ac_unit', name:'AirConditioner', x:-25, z:20, parts:[
    box('housing',{1.15,.72,.62},{x:0,y:.36,z:0},MAT.galvanized),
    cyl('fan',.25,.08,{x:0,y:.40,z:-.34},MAT.darkConcrete,{segments:16,rotationQuaternion:qZ90}),
    box('top',{1.22,.08,.68},{x:0,y:.76,z:0},MAT.metal),
  ]},
  { type:'generator', name:'PortableGenerator', x:25, z:20, parts:[
    box('body',{1.15,.78,.72},{x:0,y:.39,z:0},MAT.metal),
    box('panel',{.48,.42,.035},{x:0,y:.43,z:-.38},MAT.painted),
    cyl('exhaust',.055,.42,{x:.36,y:.92,z:0},MAT.galvanized,{segments:8}),
    box('handle',{.10,.10,.86},{x:0,y:.98,z:0},MAT.metal),
  ]},
  { type:'construction_barrel', name:'ConstructionBarrel', x:-18, z:-20, parts:[
    cyl('barrel',.34,.82,{x:0,y:.41,z:0},MAT.yellow,{segments:16,taper:.92}),
    box('stripe',{.70,.12,.70},{x:0,y:.40,z:0},MAT.glass),
    box('top',{.38,.08,.38},{x:0,y:.86,z:0},MAT.rubber),
  ]},
  { type:'manhole', name:'ManholeAssembly', x:18, z:-20, parts:[
    cyl('rim',.65,.08,{x:0,y:.04,z:0},MAT.metal,{segments:24}),
    cyl('cover',.57,.10,{x:0,y:.09,z:0},MAT.darkConcrete,{segments:24}),
    cyl('hub',.09,.12,{x:0,y:.15,z:0},MAT.metal,{segments:12}),
  ]},
];

export function createUrbanObjects(ecsWorld, physicsWorld, sceneManager, mapEntities) {
  const created = [];
  for (const spec of P) {
    const safe = Math.max(1, WORLD_CONFIG.MAP.WIDTH / 2 - WORLD_CONFIG.MAP.OBJECT_PADDING);
    if (Math.abs(spec.x) > safe || Math.abs(spec.z) > safe) continue;
    created.push(addUrbanProp(ecsWorld, physicsWorld, sceneManager, mapEntities, spec));
  }
  return created;
}
