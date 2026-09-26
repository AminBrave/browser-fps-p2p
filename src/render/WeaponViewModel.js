// src/render/WeaponViewModel.js

import * as THREE from 'three';

/**
 * First-person weapon viewmodel — parented to the camera.
 */
export class WeaponViewModel {
  /**
   * @param {THREE.Camera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'WeaponViewModel';

    // Rest pose in camera-local space (lower-right, in front of near plane)
    this.restPosition = new THREE.Vector3(0.22, -0.22, -0.45);
    this.restRotation = new THREE.Euler(0.12, 0.2, 0.08);

    this._buildMesh();
    this.root.position.copy(this.restPosition);
    this.root.rotation.copy(this.restRotation);

    // Ensure meshes draw correctly as camera children
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = 999;
        obj.frustumCulled = false;
        if (obj.material) {
          obj.material.depthTest = true;
          obj.material.depthWrite = true;
        }
      }
    });

    camera.add(this.root);

    this._bobTime = 0;
    this._recoilPitch = 0;
    this.visible = true;
  }

  _buildMesh() {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x4a4a55,
      metalness: 0.7,
      roughness: 0.35,
      emissive: 0x111114,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2a30,
      metalness: 0.5,
      roughness: 0.45,
      emissive: 0x0a0a0c,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      metalness: 0.05,
      roughness: 0.85,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0xb0b0c0,
      metalness: 0.85,
      roughness: 0.25,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      metalness: 0,
      roughness: 0.75,
    });

    // Scale factor so the gun reads clearly on screen
    const g = new THREE.Group();
    g.scale.set(1.4, 1.4, 1.4);

    // Slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.36), metal);
    slide.position.set(0, 0.05, -0.02);
    g.add(slide);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.16, 10),
      dark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.24);
    g.add(barrel);

    // Muzzle
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.035, 10),
      accent
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.05, -0.32);
    g.add(muzzle);

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.24), dark);
    frame.position.set(0, -0.015, 0.02);
    g.add(frame);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), gripMat);
    grip.position.set(0, -0.11, 0.09);
    grip.rotation.x = 0.28;
    g.add(grip);

    // Trigger guard
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.032, 0.01, 8, 16, Math.PI),
      accent
    );
    guard.rotation.y = Math.PI / 2;
    guard.rotation.z = Math.PI;
    guard.position.set(0, -0.04, 0.02);
    g.add(guard);

    // Front sight
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), accent);
    sight.position.set(0, 0.105, -0.15);
    g.add(sight);

    // Rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.012), accent);
    rearSight.position.set(0, 0.1, 0.12);
    g.add(rearSight);

    // Hand
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 0.11), skin);
    hand.position.set(0.02, -0.16, 0.16);
    g.add(hand);

    this.root.add(g);
  }

  /**
   * @param {number} dt
   * @param {boolean} isMoving
   * @param {boolean} isShooting
   */
  update(dt, isMoving = false, isShooting = false) {
    if (!this.visible) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    this._bobTime += dt * (isMoving ? 10 : 2.5);
    const bobX = Math.sin(this._bobTime) * (isMoving ? 0.01 : 0.004);
    const bobY = Math.cos(this._bobTime * 2) * (isMoving ? 0.012 : 0.005);

    if (isShooting) {
      this._recoilPitch = Math.min(this._recoilPitch + 0.14, 0.28);
    }
    this._recoilPitch = Math.max(0, this._recoilPitch - dt * 1.6);

    this.root.position.set(
      this.restPosition.x + bobX,
      this.restPosition.y + bobY - this._recoilPitch * 0.18,
      this.restPosition.z + this._recoilPitch * 0.06
    );

    this.root.rotation.set(
      this.restRotation.x - this._recoilPitch,
      this.restRotation.y,
      this.restRotation.z + bobX * 0.5
    );
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.visible = visible;
  }

  dispose() {
    if (this.camera && this.root.parent === this.camera) {
      this.camera.remove(this.root);
    }
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
