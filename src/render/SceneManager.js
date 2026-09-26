// src/render/SceneManager.js

import * as THREE from 'three';
import { GAME_CONFIG } from '../config/constants.js';

/**
 * SceneManager
 * Encapsulates the WebGL rendering pipeline, camera configuration, lighting,
 * resized event bindings, and Three.js scene setup.
 */
export class SceneManager {
  /**
   * @param {HTMLElement} containerElement - Parent DOM element for WebGL canvas.
   */
  constructor(containerElement) {
    this.container = containerElement || document.body;

    // 1. Initialize Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a24);
    this.scene.fog = new THREE.FogExp2(0x1a1a24, 0.015);

    // 2. Initialize Perspective Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(
      GAME_CONFIG.FOV,
      aspect,
      GAME_CONFIG.NEAR_PLANE,
      GAME_CONFIG.FAR_PLANE
    );
    this.camera.position.set(0, 1.6, 0); // Default eye level height

    // 3. Initialize WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Append canvas element
    this.container.appendChild(this.renderer.domElement);

    // Setup Lighting
    this._setupLighting();

    // Event listener for screen resize
    this._onWindowResize = this._onWindowResize.bind(this);
    window.addEventListener('resize', this._onWindowResize);
  }

  /**
   * Configures scene lighting including directional sun light and ambient fill.
   * @private
   */
  _setupLighting() {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Directional Sun Light
    const sunLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
    sunLight.position.set(20, 40, 20);
    sunLight.castShadow = true;

    // Shadow Map configuration
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;

    const shadowDistance = 35;
    sunLight.shadow.camera.left = -shadowDistance;
    sunLight.shadow.camera.right = shadowDistance;
    sunLight.shadow.camera.top = shadowDistance;
    sunLight.shadow.camera.bottom = -shadowDistance;
    sunLight.shadow.bias = -0.0005;

    this.scene.add(sunLight);

    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x7090b0, 0x443322, 0.3);
    this.scene.add(hemiLight);
  }

  /**
   * Window resize handler updating aspect ratio and renderer viewport.
   * @private
   */
  _onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /**
   * Renders a frame of the current scene state.
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Cleans up scene objects, events, and WebGL context.
   */
  dispose() {
    window.removeEventListener('resize', this._onWindowResize);
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}