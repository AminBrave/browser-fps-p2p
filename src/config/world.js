// src/config/world.js
//
// Single source of truth for world-space units. Every world object keeps its
// render dimensions, placement and collision dimensions together so visual
// geometry and Rapier geometry cannot silently drift apart.

const ringPositions = (radius, count) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });

export const WORLD_CONFIG = {
  GROUND_Y: 0,
  MAP: {
    WIDTH: 80, LENGTH: 80, FLOOR_THICKNESS: 0.2, OBJECT_PADDING: 1.5,
    BOUNDARY: { HEIGHT: 12, THICKNESS: 2 },
    SAFETY_FLOOR: { Y: -2, THICKNESS: 0.25 },
  },
  PLAYER: {
    SPAWN_POINTS: [
      { x: 0, z: 0 }, { x: -4, z: 4 }, { x: 4, z: 4 }, { x: 0, z: -4 },
    ],
  },
  OBJECTS: {
    CRATE: {
      PLACEMENTS: [
        { position: { x: -12, z: -8 }, size: { x: 3, y: 2, z: 3 }, color: 0xb8956c },
        { position: { x: 12, z: 8 }, size: { x: 3, y: 2, z: 3 }, color: 0xa67c52 },
        { position: { x: -8, z: 12 }, size: { x: 2.5, y: 2.5, z: 5 }, color: 0x7f8c8d },
        { position: { x: 10, z: -12 }, size: { x: 5, y: 2.5, z: 2.5 }, color: 0x7f8c8d },
        { position: { x: 0, z: 0 }, size: { x: 4, y: 2, z: 4 }, color: 0x95a5a6 },
        { position: { x: -18, z: 0 }, size: { x: 2, y: 1.2, z: 2 }, color: 0xd35400 },
        { position: { x: 18, z: 0 }, size: { x: 2, y: 1.2, z: 2 }, color: 0x2980b9 },
      ],
    },
    TREE: {
      TRUNK: { HEIGHT: 2.6, RADIUS: 0.28, RADIAL_SEGMENTS: 10 },
      CANOPY: {
        HEIGHT: 1.3, BASE_RADIUS: 1.15, LAYERS: 3, RADIUS_STEP: 0.24,
        VERTICAL_STEP: 0.8, START_CENTER_Y: 2.15, RADIAL_SEGMENTS: 10,
      },
      POSITIONS: [
        ...ringPositions(30, 12),
        { x: -6, z: -18 }, { x: 8, z: 20 }, { x: -22, z: 10 },
        { x: 20, z: -15 }, { x: 14, z: 14 }, { x: -15, z: -12 },
      ],
      COLORS: { TRUNK: 0x5c3a21, CANOPY: 0x4d8a42 },
    },
    CAR: {
      BODY: { SIZE: { x: 2, y: 0.55, z: 3.8 }, CENTER_Y: 0.595 },
      CABIN: { SIZE: { x: 1.7, y: 0.55, z: 1.8 }, CENTER_Y: 1.145, CENTER_Z: -0.15 },
      WHEELS: {
        RADIUS: 0.32, WIDTH: 0.28, OFFSET_X: 0.95, OFFSET_Z: 1.2, RADIAL_SEGMENTS: 14,
      },
      COLLIDER: { SIZE: { x: 2.1, y: 1.45, z: 3.9 }, CENTER_Y: 0.725 },
      PLACEMENTS: [
        { x: -5, z: 14, rotationY: 0.4, color: 0x2e86de },
        { x: 8, z: -16, rotationY: -0.8, color: 0xee5a24 },
        { x: 16, z: 6, rotationY: 1.2, color: 0x10ac84 },
      ],
      COLORS: { CABIN: 0x1e272e, WHEEL: 0x111111 },
    },
    BARRIER: {
      SIZE: { x: 2.5, y: 0.8, z: 0.4 }, COLOR: 0xf1c40f, Z: 6,
      POSITIONS_X: [-9, -6, -3, 3, 6, 9],
    },
    MOUNTAIN: {
      RADIUS: 8, HEIGHT: 8, SEGMENTS: 6,
      POSITIONS: [
        { x: 29, z: 28 }, { x: -29, z: 28 },
        { x: 28, z: -29 }, { x: -28, z: -29 },
      ],
    },
    PATH: { CENTER_WIDTH: 6, ARM_LENGTH: 40, THICKNESS: 0.03, COLOR: 0xc2a87c },
  },
  COLORS: { GROUND: 0x3d8b4f, MOUNTAIN: 0x4e7a42 },
};
