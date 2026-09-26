// src/render/WeaponViewModel.js

import * as THREE from 'three';

/**
 * First-person weapon viewmodel parented to camera.
 * Exposes muzzle world position for hitscan origin.
 */
export class WeaponViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'WeaponViewModel';

    this.restPosition = new THREE.Vector3(0.22, -0.22, -0.45);
    this.restRotation = new THREE.Euler(0.12, 0.2, 0.08);

    this.muzzleLocal = new THREE.Object3D();
    this._buildMesh();
    this.root.position.copy(this.restPosition);
    this.root.rotation.copy(this.restRotation);

    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = 999;
        obj.frustumCulled = false;
      }
    });

    camera.add(this.root);

    this._bobTime = 0;
    this._recoilPitch = 0;
    this._recoilKick = 0;
    this._reloadT = 0;
    this.visible = true;
    this._muzzleWorld = new THREE.Vector3();
    this._muzzleFlash = null;
  }

  _buildMesh() {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x4a4a55, metalness: 0.75, roughness: 0.3, emissive: 0x111114,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2a30, metalness: 0.5, roughness: 0.45,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x6b4423, metalness: 0.05, roughness: 0.85,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0xb0b0c0, metalness: 0.9, roughness: 0.25,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd4a574, metalness: 0, roughness: 0.75,
    });

    const g = new THREE.Group();
    g.scale.set(1.4, 1.4, 1.4);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.36), metal);
    slide.position.set(0, 0.05, -0.02);
    g.add(slide);
    this._slide = slide;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.24);
    g.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.035, 10), accent);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.05, -0.32);
    g.add(muzzle);

    // Muzzle tip marker (local → world for ray origin)
    this.muzzleLocal.position.set(0, 0.05, -0.36);
    g.add(this.muzzleLocal);

    // Muzzle flash (hidden by default)
    this._muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 })
    );
    this._muzzleFlash.position.copy(this.muzzleLocal.position);
    g.add(this._muzzleFlash);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.24), dark);
    frame.position.set(0, -0.015, 0.02);
    g.add(frame);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), gripMat);
    grip.position.set(0, -0.11, 0.09);
    grip.rotation.x = 0.28;
    g.add(grip);

    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 8, 16, Math.PI), accent);
    guard.rotation.y = Math.PI / 2;
    guard.rotation.z = Math.PI;
    guard.position.set(0, -0.04, 0.02);
    g.add(guard);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), accent);
    sight.position.set(0, 0.105, -0.15);
    g.add(sight);

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.012), accent);
    rearSight.position.set(0, 0.1, 0.12);
    g.add(rearSight);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 0.11), skin);
    hand.position.set(0.02, -0.16, 0.16);
    g.add(hand);

    this.root.add(g);
  }

  /**
   * World-space muzzle position for hitscan.
   * @returns {{x:number,y:number,z:number}}
   */
  getMuzzleWorldPosition() {
    this.muzzleLocal.getWorldPosition(this._muzzleWorld);
    return {
      x: this._muzzleWorld.x,
      y: this._muzzleWorld.y,
      z: this._muzzleWorld.z,
    };
  }

  /** Trigger visual kick + flash when a shot fires */
  onFired(recoilAmount = 0.14) {
    this._recoilKick = Math.min(this._recoilKick + recoilAmount, 0.35);
    if (this._muzzleFlash?.material) {
      this._muzzleFlash.material.opacity = 1;
    }
  }

  onReloadStart() {
    this._reloadT = 0.01;
  }

  /**
   * @param {number} dt
   * @param {boolean} isMoving
   * @param {boolean} isReloading
   */
  update(dt, isMoving = false, isReloading = false) {
    if (!this.visible) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    this._bobTime += dt * (isMoving ? 10 : 2.5);
    const bobX = Math.sin(this._bobTime) * (isMoving ? 0.01 : 0.004);
    const bobY = Math.cos(this._bobTime * 2) * (isMoving ? 0.012 : 0.005);

    // Decay kick
    this._recoilKick = Math.max(0, this._recoilKick - dt * 2.2);
    if (this._muzzleFlash?.material) {
      this._muzzleFlash.material.opacity = Math.max(
        0,
        this._muzzleFlash.material.opacity - dt * 12
      );
    }

    // Simple reload dip
    let reloadOffsetY = 0;
    let reloadOffsetX = 0;
    if (isReloading || this._reloadT > 0) {
      this._reloadT += dt;
      const t = Math.min(1, this._reloadT / 1.5);
      reloadOffsetY = -0.12 * Math.sin(t * Math.PI);
      reloadOffsetX = 0.08 * Math.sin(t * Math.PI);
      if (!isReloading && t >= 1) this._reloadT = 0;
    }

    // Slide rack on kick
    if (this._slide) {
      this._slide.position.z = -0.02 + this._recoilKick * 0.08;
    }

    this.root.position.set(
      this.restPosition.x + bobX + reloadOffsetX,
      this.restPosition.y + bobY + reloadOffsetY - this._recoilKick * 0.2,
      this.restPosition.z + this._recoilKick * 0.08
    );

    this.root.rotation.set(
      this.restRotation.x - this._recoilKick,
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
