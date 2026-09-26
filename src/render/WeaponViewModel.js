// src/render/WeaponViewModel.js

import * as THREE from 'three';

/**
 * First-person weapon viewmodel.
 * Procedural pistol mesh parented to the camera so it always stays in view
 * and rotates with look direction (true FPS feel).
 */
export class WeaponViewModel {
  /**
   * @param {THREE.Camera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'WeaponViewModel';

    // Base rest pose in camera-local space (bottom-right of the screen)
    this.restPosition = new THREE.Vector3(0.28, -0.28, -0.55);
    this.restRotation = new THREE.Euler(0.08, 0.15, 0.05);

    this._buildMesh();
    this.root.position.copy(this.restPosition);
    this.root.rotation.copy(this.restRotation);

    // Depth trick: render on top of world geometry without z-fighting the arms
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = 999;
        obj.material.depthTest = true;
        obj.material.depthWrite = true;
      }
    });

    camera.add(this.root);

    this._bobTime = 0;
    this._recoilPitch = 0;
    this.visible = true;
  }

  /**
   * Builds a simple low-poly pistol from primitives.
   * @private
   */
  _buildMesh() {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x2c2c34,
      metalness: 0.85,
      roughness: 0.35,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x1a1a1e,
      metalness: 0.6,
      roughness: 0.5,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x3d2914,
      metalness: 0.1,
      roughness: 0.9,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x8a8a98,
      metalness: 0.9,
      roughness: 0.25,
    });

    // Slide / upper receiver
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.32), metal);
    slide.position.set(0, 0.04, -0.02);
    this.root.add(slide);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.018, 0.14, 8),
      dark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.22);
    this.root.add(barrel);

    // Muzzle tip
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8),
      accent
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.04, -0.29);
    this.root.add(muzzle);

    // Frame under slide
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.22), dark);
    frame.position.set(0, -0.02, 0.02);
    this.root.add(frame);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), gripMat);
    grip.position.set(0, -0.1, 0.08);
    grip.rotation.x = 0.25;
    this.root.add(grip);

    // Trigger guard
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI),
      accent
    );
    guard.rotation.y = Math.PI / 2;
    guard.rotation.z = Math.PI;
    guard.position.set(0, -0.04, 0.02);
    this.root.add(guard);

    // Front sight
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.01), accent);
    sight.position.set(0, 0.09, -0.14);
    this.root.add(sight);

    // Rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), accent);
    rearSight.position.set(0, 0.085, 0.1);
    this.root.add(rearSight);

    // Simple hand / forearm hint (so it feels held)
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xc4a484, roughness: 0.7, metalness: 0 })
    );
    hand.position.set(0.02, -0.14, 0.14);
    this.root.add(hand);
  }

  /**
   * Per-frame update: idle bob + optional recoil recovery.
   * @param {number} dt - seconds
   * @param {boolean} isMoving
   * @param {boolean} isShooting
   */
  update(dt, isMoving = false, isShooting = false) {
    if (!this.visible) return;

    this._bobTime += dt * (isMoving ? 10 : 2);

    const bobX = Math.sin(this._bobTime) * (isMoving ? 0.008 : 0.003);
    const bobY = Math.cos(this._bobTime * 2) * (isMoving ? 0.01 : 0.004);

    // Recoil kick on shoot
    if (isShooting) {
      this._recoilPitch = Math.min(this._recoilPitch + 0.12, 0.25);
    }
    this._recoilPitch = Math.max(0, this._recoilPitch - dt * 1.5);

    this.root.position.set(
      this.restPosition.x + bobX,
      this.restPosition.y + bobY - this._recoilPitch * 0.15,
      this.restPosition.z + this._recoilPitch * 0.05
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
