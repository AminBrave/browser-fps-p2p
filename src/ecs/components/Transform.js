// src/ecs/components/Transform.js

/**
 * Transform Component Data Schema
 * Defines position and orientation vectors in 3D world space.
 */
export const TransformComponent = {
  // World space coordinates
  position: {
    x: 0,
    y: 0,
    z: 0,
  },
  // Orientation angles in radians
  rotation: {
    yaw: 0,   // Horizontal rotation (Y-axis)
    pitch: 0, // Vertical camera tilt (X-axis)
  },
};

/**
 * Creates a default Transform data structure.
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @param {number} yaw 
 * @param {number} pitch 
 * @returns {typeof TransformComponent}
 */
export function createTransform(x = 0, y = 0, z = 0, yaw = 0, pitch = 0) {
  return {
    position: { x, y, z },
    rotation: { yaw, pitch },
  };
}