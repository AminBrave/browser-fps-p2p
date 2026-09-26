// src/render/SceneManager.js

import * as THREE from 'three';
import { GAME_CONFIG } from '../config/constants.js';

/**
 * Sunny outdoor scene: blue sky, warm sun, soft shadows.
 */
export class SceneManager {
  constructor(containerElement) {
    this.container = containerElement || document.body;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0xb8d4e8, 40, 120);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(
      GAME_CONFIG.FOV || 75,
      aspect,
      GAME_CONFIG.NEAR_PLANE || 0.05,
      GAME_CONFIG.FAR_PLANE || 500
    );
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    this._setupLighting();
    this._setupSky();

    this._onWindowResize = this._onWindowResize.bind(this);
    window.addEventListener('resize', this._onWindowResize);
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0x9ecbff, 0x6b8e4e, 0.55);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xfff5e6, 0.35);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4d6, 1.35);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    const d = 45;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    this.sun = sun;

    // Soft fill from opposite side
    const fill = new THREE.DirectionalLight(0xa0c4ff, 0.25);
    fill.position.set(-20, 15, -10);
    this.scene.add(fill);
  }

  _setupSky() {
    // Simple sun disc in sky (visual only)
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff5c0 })
    );
    sunMesh.position.set(60, 80, 40);
    this.scene.add(sunMesh);

    // Distant hills (billboard-ish low boxes for horizon color)
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x5a8f4a,
      roughness: 1,
      flatShading: true,
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(12 + Math.random() * 8, 6 + Math.random() * 5, 5),
        hillMat
      );
      hill.position.set(Math.cos(a) * 55, 1, Math.sin(a) * 55);
      this.scene.add(hill);
    }
  }

  _onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onWindowResize);
    this.renderer.dispose();
    if (this.renderer.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
