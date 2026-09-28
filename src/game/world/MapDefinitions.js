// src/game/world/MapDefinitions.js
//
// Deterministic, rendering-independent map placement definitions. This module
// describes WHAT exists in the world; ECS/physics and presentation modules
// decide HOW those objects are assembled.

import { WORLD_CONFIG } from '../../config/index.js';

const groundY = () => WORLD_CONFIG.GROUND_Y;

export function clampMapPosition(x, z, halfExtentX = 0, halfExtentZ = 0) {
  const { WIDTH, LENGTH, OBJECT_PADDING } = WORLD_CONFIG.MAP;
  const maxX = Math.max(0, WIDTH / 2 - OBJECT_PADDING - halfExtentX);
  const maxZ = Math.max(0, LENGTH / 2 - OBJECT_PADDING - halfExtentZ);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    z: Math.max(-maxZ, Math.min(maxZ, z)),
  };
}

export function getGroundDefinition() {
  const { WIDTH, LENGTH, FLOOR_THICKNESS } = WORLD_CONFIG.MAP;
  return {
    position: { x: 0, y: groundY() - FLOOR_THICKNESS / 2, z: 0 },
    size: { x: WIDTH, y: FLOOR_THICKNESS, z: LENGTH },
    materialType: 'dirt',
    color: WORLD_CONFIG.COLORS.GROUND,
  };
}

export function getPathDefinitions() {
  const path = WORLD_CONFIG.OBJECTS.PATH;
  return [
    {
      position: { x: 0, y: groundY() - path.THICKNESS / 2, z: 0 },
      size: { x: path.ARM_LENGTH, y: path.THICKNESS, z: path.CENTER_WIDTH },
      thickness: path.THICKNESS,
      color: path.COLOR,
      name: 'path-horizontal',
    },
    {
      position: { x: 0, y: groundY() - path.THICKNESS / 2, z: 0 },
      size: { x: path.CENTER_WIDTH, y: path.THICKNESS, z: path.ARM_LENGTH },
      thickness: path.THICKNESS,
      color: path.COLOR,
      name: 'path-vertical',
    },
  ];
}

export function getBoundaryDefinitions() {
  const { WIDTH, LENGTH, BOUNDARY } = WORLD_CONFIG.MAP;
  const halfW = WIDTH / 2;
  const halfL = LENGTH / 2;
  const { HEIGHT, THICKNESS } = BOUNDARY;
  return [
    { x: 0, z: -halfL - THICKNESS / 2, size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS } },
    { x: 0, z: halfL + THICKNESS / 2, size: { x: WIDTH + THICKNESS * 2, y: HEIGHT, z: THICKNESS } },
    { x: -halfW - THICKNESS / 2, z: 0, size: { x: THICKNESS, y: HEIGHT, z: LENGTH } },
    { x: halfW + THICKNESS / 2, z: 0, size: { x: THICKNESS, y: HEIGHT, z: LENGTH } },
  ].map((wall) => ({ ...wall, y: groundY(), materialType: 'concrete', name: 'boundary' }));
}

export function getCrateDefinitions() {
  return WORLD_CONFIG.OBJECTS.CRATE.PLACEMENTS.map((placement) => ({
    ...placement,
    materialType: 'wood',
    name: 'crate',
  }));
}

export function getBarrierDefinitions() {
  const barrier = WORLD_CONFIG.OBJECTS.BARRIER;
  return barrier.POSITIONS_X.map((x) => ({
    position: { x, z: barrier.Z },
    size: barrier.SIZE,
    color: barrier.COLOR,
    materialType: 'concrete',
    name: 'barrier',
  }));
}

export function getMountainDefinitions() {
  return WORLD_CONFIG.OBJECTS.MOUNTAIN.POSITIONS.map((position) => ({
    ...position,
    materialType: 'stone',
    name: 'mountain',
  }));
}

export function getTreeDefinitions() {
  return WORLD_CONFIG.OBJECTS.TREE.POSITIONS.map((position) => ({ ...position, name: 'tree' }));
}

export function getCarDefinitions() {
  return WORLD_CONFIG.OBJECTS.CAR.PLACEMENTS.map((placement) => ({ ...placement, name: 'car' }));
}

export function getStreetLightDefinitions() {
  return WORLD_CONFIG.OBJECTS.STREETLIGHT.POSITIONS.map((position) => ({ ...position, name: 'streetlight' }));
}

export function getDumpsterDefinitions() {
  return WORLD_CONFIG.OBJECTS.DUMPSTER.POSITIONS.map((position) => ({ ...position, name: 'dumpster' }));
}
