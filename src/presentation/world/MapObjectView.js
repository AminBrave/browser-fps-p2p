import * as THREE from 'three';

/** Presentation-only construction for generic static map boxes. */
export class MapObjectView {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
  }

  staticBox({ position, size, color, roughness = 0.7, rotationY = 0, name = 'box' }) {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 })
    );
    mesh.position.y = size.y / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    root.position.set(position.x, position.y, position.z);
    root.rotation.y = rotationY;
    mesh.name = name;
    this.sceneManager?.scene?.add(root);
    return { root, targets: [mesh] };
  }
}
