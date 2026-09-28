export function calculatePositionError(serverPosition, predictedPosition) {
  return {
    x: Number(serverPosition?.x || 0) - Number(predictedPosition?.x || 0),
    y: Number(serverPosition?.y || 0) - Number(predictedPosition?.y || 0),
    z: Number(serverPosition?.z || 0) - Number(predictedPosition?.z || 0),
  };
}

export function magnitude(vector) {
  return Math.hypot(
    Number(vector?.x) || 0,
    Number(vector?.y) || 0,
    Number(vector?.z) || 0
  );
}

export function calculateVisualCorrection(predictedCurrent, correctedCurrent) {
  return {
    x: Number(predictedCurrent?.x || 0) - Number(correctedCurrent?.x || 0),
    y: Number(predictedCurrent?.y || 0) - Number(correctedCurrent?.y || 0),
    z: Number(predictedCurrent?.z || 0) - Number(correctedCurrent?.z || 0),
  };
}
