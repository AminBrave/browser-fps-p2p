import * as THREE from 'three';
import { WORLD_CONFIG } from '../../config/index.js';

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

  addToScene(object) { this.sceneManager?.scene?.add(object); }

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
      const centerY = config.CANOPY.START_CENTER_Y + i * config.CANOPY.VERTICAL_STEP;
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

  car({ position, rotationY = 0, color }) {
    const config = WORLD_CONFIG.OBJECTS.CAR;
    const group = new THREE.Group();
    group.name = 'DetailedCar';
    group.position.set(position.x, position.y, position.z);
    group.rotation.y = rotationY;

    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181b, metalness: 0.35, roughness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x18384a, metalness: 0.2, roughness: 0.18, transparent: true, opacity: 0.72 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, metalness: 0.9, roughness: 0.2 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff0bd, emissive: 0x66551f, emissiveIntensity: 1.5 });
    const redLightMat = new THREE.MeshStandardMaterial({ color: 0x8e1717, emissive: 0x3d0505, emissiveIntensity: 1.2 });
    const addBox = (size, pos, mat, name) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
      mesh.name = name; mesh.position.set(pos.x, pos.y, pos.z);
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const body = addBox(config.BODY.SIZE, { x: 0, y: config.BODY.CENTER_Y, z: 0 }, bodyMat, 'carBody');
    const hood = addBox({ x: 1.82, y: 0.16, z: 0.9 }, { x: 0, y: 0.79, z: -1.38 }, bodyMat, 'hood');
    const trunk = addBox({ x: 1.82, y: 0.15, z: 0.65 }, { x: 0, y: 0.76, z: 1.35 }, bodyMat, 'trunk');
    const cabin = addBox(config.CABIN.SIZE, { x: 0, y: config.CABIN.CENTER_Y, z: config.CABIN.CENTER_Z }, darkMat, 'cabinFrame');
    addBox({ x: 1.48, y: 0.38, z: 0.035 }, { x: 0, y: 1.22, z: -1.01 }, glassMat, 'windshield');
    addBox({ x: 1.48, y: 0.36, z: 0.035 }, { x: 0, y: 1.21, z: 0.72 }, glassMat, 'rearWindow');
    addBox({ x: 0.035, y: 0.34, z: 1.38 }, { x: -0.84, y: 1.21, z: -0.14 }, glassMat, 'leftWindow');
    addBox({ x: 0.035, y: 0.34, z: 1.38 }, { x: 0.84, y: 1.21, z: -0.14 }, glassMat, 'rightWindow');
    addBox({ x: 1.95, y: 0.18, z: 0.14 }, { x: 0, y: 0.43, z: -1.93 }, chromeMat, 'frontBumper');
    addBox({ x: 1.95, y: 0.18, z: 0.14 }, { x: 0, y: 0.43, z: 1.93 }, chromeMat, 'rearBumper');
    addBox({ x: 0.36, y: 0.18, z: 0.06 }, { x: -0.63, y: 0.72, z: -1.94 }, lightMat, 'headlightL');
    addBox({ x: 0.36, y: 0.18, z: 0.06 }, { x: 0.63, y: 0.72, z: -1.94 }, lightMat, 'headlightR');
    addBox({ x: 0.36, y: 0.16, z: 0.06 }, { x: -0.63, y: 0.72, z: 1.94 }, redLightMat, 'tailLightL');
    addBox({ x: 0.36, y: 0.16, z: 0.06 }, { x: 0.63, y: 0.72, z: 1.94 }, redLightMat, 'tailLightR');
    const mirrorGeo = new THREE.BoxGeometry(0.12, 0.09, 0.22);
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(mirrorGeo, darkMat);
      mirror.position.set(side * 1.02, 1.13, -0.38); mirror.castShadow = true; group.add(mirror);
    }
    const wheelMat = new THREE.MeshStandardMaterial({ color: config.COLORS.WHEEL, roughness: 0.88, metalness: 0.08 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x858b91, metalness: 0.85, roughness: 0.22 });
    const wheelGeo = new THREE.CylinderGeometry(config.WHEELS.RADIUS, config.WHEELS.RADIUS, config.WHEELS.WIDTH, config.WHEELS.RADIAL_SEGMENTS);
    const wheelPositions = [
      { x: config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
      { x: -config.WHEELS.OFFSET_X, z: config.WHEELS.OFFSET_Z },
      { x: config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
      { x: -config.WHEELS.OFFSET_X, z: -config.WHEELS.OFFSET_Z },
    ];
    const wheelMeshes = [];
    for (const { x, z } of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, config.WHEELS.RADIUS, z);
      wheel.castShadow = true; group.add(wheel);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, config.WHEELS.WIDTH + 0.015, 12), rimMat);
      rim.rotation.z = Math.PI / 2; rim.position.copy(wheel.position); group.add(rim);
      wheelMeshes.push(wheel);
    }
    const presentationTargets = [body, hood, trunk, cabin,
      group.children.find((child) => child.name === 'windshield'),
      group.children.find((child) => child.name === 'rearWindow'),
      group.children.find((child) => child.name === 'leftWindow'),
      group.children.find((child) => child.name === 'rightWindow'),
      ...wheelMeshes];
    this.addToScene(group);
    return { root: group, targets: presentationTargets };
  }
}
