// src/config/world.js
//
// Single source of truth for world-space units, playable bounds, object
// dimensions, placement and collision policy. Rendering and physics consume
// the same values so changing the world does not require chasing literals.

export const WORLD_CONFIG = {
  GROUND_Y: 0,

  MAP: {
    WIDTH: 80,
    LENGTH: 80,
    FLOOR_THICKNESS: 0.2,
    BOUNDARY: {
      HEIGHT: 12,
      THICKNESS: 2,
    },
    SAFETY_FLOOR: {
      Y: -2,
      THICKNESS: 0.25,
    },
    OBJECT_PADDING: 1.5,
  },

  PLAYER: {
    SPAWN_POINTS: [
      { x: 0, z: 0 },
      { x: -4, z: 4 },
      { x: 4, z: 4 },
      { x: 0, z: -4 },
    ],
  },

  OBJECTS: {
    CRATE: {
      SIZES: [
        { x: 3, y: 2, z: 3 },
        { x: 3, y: 2, z: 3 },
        { x: 2.5, y: 2.5, z: 5 },
        { x: 5, y: 2.5, z: 2.5 },
        { x: 4, y: 2, z: 4 },
        { x: 2, y: 1.2, z: 2 },
        { x: 2, y: 1.2, z: 2 },
      ],
      POSITIONS: [
        { x: -12, z: -8 },
        { x: 12, z: 8 },
        { x: -8, z: 12 },
        { x: 10, z: -12 },
        { x: 0, z: 0 },
        { x: -18, z: 0 },
        { x: 18, z: 0 },
      ],
      COLORS: [0xb8956c, 0xa67c52, 0x7f8c8d, 0x7f8c8d, 0x95a5a6, 0xd35400, 0x2980b9],
    },

    TREE: {
      TRUNK_HEIGHT: 2.6,
      TRUNK_RADIUS: 0.28,
      CANOPY_RADIUS: 1.15,
      CANOPY_HEIGHT: 1.3,
      CANOPY_LAYERS: 3,
      POSITIONS: [
        ...Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return { x: Math.cos(a) * 30, z: Math.sin(a) * 30 };
        }),
        { x: -6, z: -18 },
        { x: 8, z: 20 },
        { x: -22, z: 10 },
        { x: 20, z: -15 },
        { x: 14, z: 14 },
        { x: -15, z: -12 },
      ],
    },

    CAR: {
      BODY: { x: 2, y: 0.55, z: 3.8 },
      CABIN: { x: 1.7, y: 0.55, z: 1.8 },
      WHEEL_RADIUS: 0.32,
      WHEEL_WIDTH: 0.28,
      WHEEL_OFFSET_X: 0.95,
      WHEEL_OFFSET_Z: 1.2,
      BODY_COLLIDER: { x: 2.1, y: 1.1, z: 3.9 },
      POSITIONS: [
        { x: -5, z: 14, rotationY: 0.4 },
        { x: 8, z: -16, rotationY: -0.8 },
        { x: 16, z: 6, rotationY: 1.2 },
      ],
    },

    BARRIER: {
      SIZE: { x: 2.5, y: 0.8, z: 0.4 },
      COLOR: 0xf1c40f,
      Z: 6,
      POSITIONS_X: [-9, -6, -3, 3, 6, 9],
    },

    MOUNTAIN: {
      RADIUS: 8,
      HEIGHT: 8,
      SEGMENTS: 6,
      POSITIONS: [
        { x: 29, z: 28 },
        { x: -29, z: 28 },
        { x: 28, z: -29 },
        { x: -28, z: -29 },
      ],
    },

    PATH: {
      CENTER_WIDTH: 6,
      ARM_LENGTH: 40,
      THICKNESS: 0.03,
      COLOR: 0xc2a87c,
    },
  },

  COLORS: {
    GROUND: 0x3d8b4f,
    TREE_TRUNK: 0x5c3a21,
    TREE_CANOPY: 0x4d8a42,
    CAR_CABIN: 0x1e272e,
    MOUNTAIN: 0x4e7a42,
  },
};
