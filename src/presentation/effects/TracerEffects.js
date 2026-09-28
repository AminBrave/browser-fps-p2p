import * as THREE from 'three';

function disposeObject3D(root) {
  root?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
    else material?.dispose?.();
  });
}

export function createBullet(
  effectStore,
  sceneOrManager,
  startPos,
  endPos,
  trajectoryPoints = null
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;
  const points = Array.isArray(trajectoryPoints) && trajectoryPoints.length >= 2
    ? trajectoryPoints
    : [startPos, endPos];

  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((point) => new THREE.Vector3(point.x, point.y, point.z))
  );
  const material = new THREE.LineBasicMaterial({
    color: 0xffe08a,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const lineMesh = new THREE.Line(geometry, material);
  lineMesh.renderOrder = 10;
  scene?.add?.(lineMesh);

  return effectStore?.add?.({
    root: lineMesh,
    durationMs: 60,
    update: ({ progress }) => {
      material.opacity = 0.95 * (1 - progress);
    },
    dispose: () => {
      lineMesh.parent?.remove?.(lineMesh);
      disposeObject3D(lineMesh);
    },
  }) || null;
}
