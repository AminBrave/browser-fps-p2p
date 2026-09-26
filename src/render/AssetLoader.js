// src/render/AssetLoader.js

import * as THREE from 'three';

/**
 * AssetLoader
 * Manages loading and caching of 3D models, textures, and audio assets
 * using native Three.js loaders with Promise wrappers.
 */
export class AssetLoader {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.audioLoader = new THREE.AudioLoader();
    this.cache = new Map();
  }

  /**
   * Loads a texture file and caches the result.
   * 
   * @param {string} url - Texture asset path.
   * @returns {Promise<THREE.Texture>} Loaded texture instance.
   */
  loadTexture(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          this.cache.set(url, texture);
          resolve(texture);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  /**
   * Loads an audio buffer asset and caches the result.
   * 
   * @param {string} url - Audio asset path.
   * @returns {Promise<AudioBuffer>} Loaded audio buffer.
   */
  loadAudio(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.audioLoader.load(
        url,
        (buffer) => {
          this.cache.set(url, buffer);
          resolve(buffer);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  /**
   * Generates procedural placeholder textures when asset files are missing.
   * 
   * @param {string} colorHex - CSS color code or hex string.
   * @returns {THREE.CanvasTexture} Procedural texture instance.
   */
  createPlaceholderTexture(colorHex = '#888888') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Clears cached assets and frees memory.
   */
  clearCache() {
    this.cache.forEach((asset) => {
      if (asset.dispose) asset.dispose();
    });
    this.cache.clear();
  }
}