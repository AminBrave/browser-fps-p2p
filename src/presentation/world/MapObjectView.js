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

  tree({ position }) {
    const config = WORLD_CONFIG.OBJECTS.TREE;
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(config.TRUNK.RADIUS, config.TRUNK.RADIUS, config.TRUNK.HEIGHT, config.TRUNK.RADIAL_SEGMENTS),
      new THREE.MeshStandardMaterial({ color: config.COLORS.TRUNK, roughness: 0.92 })
    );
    trunk.position.y = config.TRUNK.HEIGHT / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: config.COLORS.CANOPY, roughness: 0.9 });
    const targets = [trunk];
    for (let i = 0; i < config.CANOPY.LAYERS; i++) {
      const radius = Math.max(0.05, config.CANOPY.BASE_RADIUS - i * config.CANOPY.RADIUS_STEP);
      const centerY = config.CANOPY.START_CENTER_Y + i * config.VERTICAL_STEP;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, config.CANOPY.HEIGHT, config.CANOPY.RADIAL_SEGMENTS), leafMat);
      cone.position.y = centerY;
      cone.castShadow = true;
      cone.receiveShadow = true;
      group.add(cone);
      targets.push(cone);
    }
    this.addToScene(group);
    return { root: group, targets };
  }
}
