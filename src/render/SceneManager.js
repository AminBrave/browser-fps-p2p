import * as THREE from 'three';
import { CAMERA_CONFIG, RENDER_CONFIG, resolvePerformanceProfile } from '../config/index.js';

function disposeMaterial(material, disposedMaterials) {
  if (!material || disposedMaterials.has(material)) return;
  disposedMaterials.add(material);

  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}

function disposeSceneResources(scene) {
  const geometries = new Set();
  const materials = new Set();

  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);

    if (Array.isArray(object.material)) {
      object.material.forEach((material) => materials.add(material));
    } else if (object.material) {
      materials.add(object.material);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  const disposedMaterials = new Set();
  for (const material of materials) disposeMaterial(material, disposedMaterials);
}

/**
 * Owns the Three.js scene, camera, renderer and window lifecycle.
 */
export class SceneManager {
  constructor(containerElement, performanceProfile = null) {
    this.container = containerElement || document.body;
    this.performanceProfile = performanceProfile || resolvePerformanceProfile();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Viewmodels are rendered in a second pass so world geometry can never
    // depth-clip the weapon mesh when the camera gets close to a wall/object.
    this.weaponScene = new THREE.Scene();
    this.weaponScene.name = 'WeaponViewModelScene';
    this.weaponScene.add(
      new THREE.HemisphereLight(0xffffff, 0x555555, 1.8),
      new THREE.DirectionalLight(0xffffff, 1.4)
    );
    this.scene.fog = new THREE.Fog(0xb8d4e8, 40, this.performanceProfile.maxFogDistance);

    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.FOV,
      aspect,
      CAMERA_CONFIG.NEAR_PLANE,
      CAMERA_CONFIG.FAR_PLANE
    );
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.performanceProfile.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._applyPixelRatio();
    this.renderer.shadowMap.enabled = this.performanceProfile.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.performanceProfile.shadows) {
      const shadowMapSize = this.performanceProfile.shadowMapSize;
      // The directional light is created below; its map is allocated lazily.
      this._shadowMapSize = shadowMapSize;
    }
    this.renderer.toneMapping = this.performanceProfile.toneMapping
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = this.performanceProfile.toneMapping ? 1.15 : 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    this._setupLighting();
    this._setupSky();

    this.disposed = false;
    this._onWindowResize = this._onWindowResize.bind(this);
    window.addEventListener('resize', this._onWindowResize);
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0x9ecbff, 0x6b8e4e, 0.55);
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.35);
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.35);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    const shadowMapSize = this._shadowMapSize || 1024;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    const d = 45;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0003;

    const fill = new THREE.DirectionalLight(0xa0c4ff, 0.25);
    fill.position.set(-20, 15, -10);

    this.scene.add(hemi, ambient, sun, fill);
    this.sun = sun;
  }

  _setupSky() {
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff5c0 })
    );
    sunMesh.position.set(60, 80, 40);
    this.scene.add(sunMesh);

    // Shared geometry/material reduces GPU allocations for the horizon.
    const hillGeometry = new THREE.ConeGeometry(16, 8, 5);
    const hillMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a8f4a,
      roughness: 1,
      flatShading: true,
    });

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const hill = new THREE.Mesh(hillGeometry, hillMaterial);
      hill.position.set(Math.cos(a) * 55, 1, Math.sin(a) * 55);
      this.scene.add(hill);
    }
  }

  _applyPixelRatio() {
    const deviceRatio = Number(window.devicePixelRatio) || 1;
    const ratio = Math.min(
      deviceRatio * this.performanceProfile.pixelRatioScale,
      this.performanceProfile.maxPixelRatio,
      RENDER_CONFIG.MAX_PIXEL_RATIO
    );
    this.renderer.setPixelRatio(Math.max(0.5, ratio));
  }

  _onWindowResize() {
    if (this.disposed) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this._applyPixelRatio();
  }

  render() {
    if (this.disposed) return;

    // Keep the viewmodel isolated, but avoid the extra depth clear when there
    // is no active weapon. This preserves the two-pass design without doing
    // unnecessary work on frames where the player is dead.
    this.renderer.autoClear = false;
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    if (this.weaponScene.children.length > 0) {
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.camera);
    }
    this.renderer.autoClear = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('resize', this._onWindowResize);
    disposeSceneResources(this.scene);
    disposeSceneResources(this.weaponScene);

    this.renderer.dispose();
    this.renderer.renderLists?.dispose?.();

    const canvas = this.renderer.domElement;
    canvas?.parentNode?.removeChild(canvas);

    this.scene.clear();
    this.weaponScene.clear();
  }
}
