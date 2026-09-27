// src/render/WeaponViewModel.js

import * as THREE from 'three';
import { RENDER_CONFIG } from '../config/index.js';

/**
 * Distinct procedural viewmodels for Pistol / SMG / Shotgun / Rifle.
 */
export class WeaponViewModel {
  constructor(camera, viewModelScene = null) {
    this.camera = camera;
    this.viewModelScene = viewModelScene;
    this.anchor = new THREE.Group();
    this.anchor.name = 'WeaponViewModelAnchor';
    this.root = new THREE.Group();
    this.root.name = 'WeaponViewModel';

    this.restPosition = new THREE.Vector3(0.22, -0.22, -0.48);
    this.restRotation = new THREE.Euler(0.1, 0.18, 0.06);

    this.muzzleLocal = new THREE.Object3D();
    this._models = {};
    this._activeId = null;

    this._buildAllModels();
    this.setWeaponType(1); // pistol default

    this.root.position.copy(this.restPosition);
    this.root.rotation.copy(this.restRotation);
    // Keep the weapon in a dedicated scene. The anchor mirrors the camera's
    // world transform every frame, while the weapon itself keeps its normal
    // camera-local offset/recoil/bob transforms.
    if (this.viewModelScene) {
      this.viewModelScene.add(this.anchor);
      this.anchor.add(this.root);
    } else {
      camera.add(this.root);
    }

    this._bobTime = 0;
    this._recoilKick = 0;
    this._reloadT = 0;
    this._swayX = 0;
    this._swayY = 0;
    this.visible = true;
    this._muzzleWorld = new THREE.Vector3();
    this._muzzleEffects = new Map();
    this._firePulse = 0;
    this._aimAmount = 0;
  }

  _mat(color, metal = 0.6, rough = 0.4) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: metal,
      roughness: rough,
    });
  }

  _buildAllModels() {
    this._models[1] = this._buildPistol();
    this._models[2] = this._buildSmg();
    this._models[3] = this._buildShotgun();
    this._models[4] = this._buildRifle();
    for (const g of Object.values(this._models)) {
      g.visible = false;
      this.root.add(g);
    }

    this._addMuzzleEffect(this._models[1], this._models[1].userData.muzzle, 0xff9f1c, 1.15);
    this._addMuzzleEffect(this._models[2], this._models[2].userData.muzzle, 0xffb52e, 1.05);
    this._addMuzzleEffect(this._models[3], this._models[3].userData.muzzle, 0xff8a18, 1.45);
    this._addMuzzleEffect(this._models[4], this._models[4].userData.muzzle, 0xffb52e, 1.2);
  }

  _buildPistol() {
    const g = new THREE.Group();
    g.scale.setScalar(1.35);
    const metal = this._mat(0x4a4a55, 0.8, 0.3);
    const dark = this._mat(0x2a2a30, 0.5, 0.5);
    const grip = this._mat(0x6b4423, 0.05, 0.9);
    const accent = this._mat(0xb0b0c0, 0.9, 0.25);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), metal);
    slide.position.set(0, 0.05, -0.02);
    g.add(slide);
    this._pistolSlide = slide;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.14, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.22);
    g.add(barrel);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.2), dark);
    frame.position.set(0, -0.02, 0.02);
    g.add(frame);

    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), grip);
    gr.position.set(0, -0.1, 0.08);
    gr.rotation.x = 0.28;
    g.add(gr);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.01), accent);
    sight.position.set(0, 0.1, -0.12);
    g.add(sight);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.05, -0.32);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 })
    );
    flash.position.copy(muzzle.position);
    g.add(flash);
    g.userData.flash = flash;

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.05, 0.1),
      this._mat(0xd4a574, 0, 0.75)
    );
    hand.position.set(0.02, -0.14, 0.14);
    g.add(hand);
    return g;
  }

  _buildSmg() {
    const g = new THREE.Group();
    g.scale.setScalar(1.25);
    const metal = this._mat(0x3d3d48, 0.75, 0.35);
    const dark = this._mat(0x222228, 0.4, 0.55);
    const grip = this._mat(0x2c2c30, 0.2, 0.7);

    // Receiver
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), metal);
    body.position.set(0, 0.02, -0.05);
    g.add(body);

    // Long barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.28, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.35);
    g.add(barrel);

    // Mag well
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), grip);
    mag.position.set(0, -0.12, 0.02);
    g.add(mag);

    // Stock stub
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.14), dark);
    stock.position.set(0, 0.02, 0.2);
    g.add(stock);

    // Front grip
    const fg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), grip);
    fg.position.set(0, -0.08, -0.18);
    g.add(fg);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.04, -0.5);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 })
    );
    flash.position.copy(muzzle.position);
    g.add(flash);
    g.userData.flash = flash;

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.045, 0.09),
      this._mat(0xd4a574, 0, 0.75)
    );
    hand.position.set(0.015, -0.16, 0.1);
    g.add(hand);
    return g;
  }

  _buildShotgun() {
    const g = new THREE.Group();
    g.scale.setScalar(1.2);
    const wood = this._mat(0x8b5a2b, 0.1, 0.85);
    const metal = this._mat(0x555560, 0.85, 0.3);
    const dark = this._mat(0x2a2a30, 0.5, 0.5);

    // Dual barrel look
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), metal);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(0, 0.06, -0.2);
    g.add(b1);
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), metal);
    b2.rotation.x = Math.PI / 2;
    b2.position.set(0, 0.02, -0.2);
    g.add(b2);

    // Receiver
    const recv = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.2), dark);
    recv.position.set(0, 0.04, 0.12);
    g.add(recv);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.28), wood);
    stock.position.set(0, 0.0, 0.32);
    stock.rotation.x = -0.15;
    g.add(stock);

    // Pump
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), wood);
    pump.position.set(0, -0.02, -0.05);
    g.add(pump);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.04, -0.5);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0 })
    );
    flash.position.copy(muzzle.position);
    g.add(flash);
    g.userData.flash = flash;

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.05, 0.1),
      this._mat(0xd4a574, 0, 0.75)
    );
    hand.position.set(0.02, -0.12, 0.18);
    g.add(hand);
    return g;
  }

  _buildRifle() {
    const g = new THREE.Group();
    g.scale.setScalar(1.2);
    const metal = this._mat(0x3a4a3a, 0.7, 0.4);
    const dark = this._mat(0x1e2420, 0.4, 0.55);
    const accent = this._mat(0x2d3a2d, 0.5, 0.45);

    // Long receiver
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.5), metal);
    body.position.set(0, 0.03, -0.05);
    g.add(body);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.4, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.42);
    g.add(barrel);

    // Mag
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.07), accent);
    mag.position.set(0, -0.1, 0.0);
    g.add(mag);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.22), dark);
    stock.position.set(0, 0.02, 0.28);
    g.add(stock);

    // Carry handle / optic mount
    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), accent);
    optic.position.set(0, 0.12, -0.05);
    g.add(optic);

    // Handguard
    const hg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), dark);
    hg.position.set(0, 0.02, -0.22);
    g.add(hg);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.05, -0.62);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 })
    );
    flash.position.copy(muzzle.position);
    g.add(flash);
    g.userData.flash = flash;

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.045, 0.09),
      this._mat(0xd4a574, 0, 0.75)
    );
    hand.position.set(0.015, -0.14, 0.12);
    g.add(hand);
    return g;
  }

  _addMuzzleEffect(weaponRoot, muzzle, color, scale = 1) {
    const effect = new THREE.Group();
    effect.name = 'muzzleFlash';
    effect.position.copy(muzzle.position);
    effect.scale.setScalar(scale);
    effect.visible = false;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xfff4c2,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    core.name = 'muzzleCore';
    effect.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 12, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.name = 'muzzleHalo';
    effect.add(halo);

    const rays = new THREE.Group();
    rays.name = 'muzzleRays';
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const length = 0.11 + (i % 2) * 0.055;
      const ray = new THREE.Mesh(
        new THREE.ConeGeometry(0.018, length, 5),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ray.position.set(Math.cos(angle) * 0.035, Math.sin(angle) * 0.035, -length * 0.5);
      ray.rotation.z = -angle;
      ray.rotation.x = Math.PI / 2;
      rays.add(ray);
    }
    effect.add(rays);

    // Keep the flash self-lit. A point light here illuminates the gun body,
    // which makes the whole weapon appear to glow during firing.
    const light = new THREE.PointLight(color, 0, 0.45);
    light.name = 'muzzleFlashLight';
    light.position.set(0, 0, 0);
    light.visible = false;
    effect.add(light);

    effect.userData.life = 0;
    effect.userData.maxLife = RENDER_CONFIG.MUZZLE_FLASH.DURATION_SECONDS;
    effect.userData.scale = scale;
    effect.userData.core = core;
    effect.userData.halo = halo;
    effect.userData.rays = rays;
    effect.userData.light = light;

    weaponRoot.add(effect);
    weaponRoot.userData.muzzleEffect = effect;
    return effect;
  }

  /** @param {number} typeId 1..4 */
  setWeaponType(typeId) {
    if (this._activeId === typeId) return;
    for (const [id, g] of Object.entries(this._models)) {
      g.visible = Number(id) === typeId;
    }
    this._activeId = typeId;
    const active = this._models[typeId];
    if (active?.userData?.muzzle) {
      // Re-parent reference
      this.muzzleLocal = active.userData.muzzle;
    }
  }

  getMuzzleWorldPosition() {
    if (this.muzzleLocal?.getWorldPosition) {
      this.muzzleLocal.getWorldPosition(this._muzzleWorld);
    } else {
      this._muzzleWorld.set(0, 0, -1);
    }
    return {
      x: this._muzzleWorld.x,
      y: this._muzzleWorld.y,
      z: this._muzzleWorld.z,
    };
  }

  onFired(amount = 0.12) {
    this._recoilKick = Math.min(this._recoilKick + amount, 0.55);
    this._firePulse = 1;
    const active = this._models[this._activeId];
    const effect = active?.userData?.muzzleEffect;
    if (effect) {
      effect.userData.life = effect.userData.maxLife;
      effect.visible = true;
      effect.userData.light.intensity = 0;
    }
    if (active?.userData?.flash?.material) active.userData.flash.material.opacity = 1;
  }

  onReloadStart() {
    this._reloadT = 0.01;
  }

  /**
   * @param {number} dt
   * @param {boolean} isMoving
   * @param {boolean} isReloading
   * @param {number} moveIntensity 0..1
   * @param {boolean} isAiming hold RMB to aim down sights
   */
  update(dt, isMoving = false, isReloading = false, moveIntensity = 0, isAiming = false) {
    if (!this.visible) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    if (this.viewModelScene) {
      this.anchor.position.copy(this.camera.position);
      this.anchor.quaternion.copy(this.camera.quaternion);
      this.anchor.scale.set(1, 1, 1);
      this.anchor.updateMatrixWorld(true);
    }

    const bobSpeed = 8 + moveIntensity * 6;
    this._bobTime += dt * bobSpeed;
    const bobAmp = 0.004 + moveIntensity * 0.014;
    const bobX = Math.sin(this._bobTime) * bobAmp;
    const bobY = Math.cos(this._bobTime * 2) * bobAmp * 1.2;

    // Extra micro-shake when moving hard
    this._swayX += (Math.random() - 0.5) * moveIntensity * 0.004;
    this._swayY += (Math.random() - 0.5) * moveIntensity * 0.004;
    this._swayX *= 0.85;
    this._swayY *= 0.85;

    const aimBlend = 1 - Math.exp(-dt / Math.max(0.01, RENDER_CONFIG.AIM.TRANSITION_SECONDS));
    this._aimAmount = THREE.MathUtils.lerp(this._aimAmount, isAiming ? 1 : 0, aimBlend);

    this._recoilKick = Math.max(0, this._recoilKick - dt * 2.4);
    this._firePulse = Math.max(0, this._firePulse - dt * 18);
    const active = this._models[this._activeId];
    const effect = active?.userData?.muzzleEffect;
    if (effect) {
      const life = Math.max(0, Number(effect.userData.life) || 0);
      if (life > 0) {
        effect.userData.life = Math.max(0, life - dt);
        const t = effect.userData.life / effect.userData.maxLife;
        effect.visible = t > 0;
        effect.userData.core.material.opacity = Math.min(1, t * 1.35);
        effect.userData.halo.material.opacity = t * 0.55;
        effect.userData.rays.children.forEach((ray, i) => {
          ray.material.opacity = t * (0.7 - i * 0.06);
          ray.scale.z = 0.65 + t * (0.5 + (i % 2) * 0.35);
        });
        effect.userData.light.intensity = 0;
      } else {
        effect.visible = false;
        effect.userData.light.intensity = 0;
      }
    }
    if (active?.userData?.flash?.material) {
      active.userData.flash.material.opacity = Math.max(0, this._firePulse);
    }

    let reloadY = 0;
    let reloadX = 0;
    if (isReloading || this._reloadT > 0) {
      this._reloadT += dt;
      const t = Math.min(1, this._reloadT / 1.4);
      reloadY = -0.1 * Math.sin(t * Math.PI);
      reloadX = 0.06 * Math.sin(t * Math.PI);
      if (!isReloading && t >= 1) this._reloadT = 0;
    }

    const aim = this._aimAmount;
    const pose = RENDER_CONFIG.AIM.WEAPON_POSES?.[this._activeId] || {
      x: RENDER_CONFIG.AIM.WEAPON_POSITION_X,
      y: RENDER_CONFIG.AIM.WEAPON_POSITION_Y,
      z: RENDER_CONFIG.AIM.WEAPON_POSITION_Z,
      pitch: 0,
      yaw: 0,
      roll: 0,
    };
    const targetX = pose.x;
    const targetY = pose.y;
    const targetZ = pose.z;
    const baseX = THREE.MathUtils.lerp(this.restPosition.x, targetX, aim);
    const baseY = THREE.MathUtils.lerp(this.restPosition.y, targetY, aim);
    const baseZ = THREE.MathUtils.lerp(this.restPosition.z, targetZ, aim);
    this.root.position.set(
      baseX + bobX * (1 - aim * 0.85) + this._swayX * (1 - aim * 0.7) + reloadX - this._recoilKick * 0.22,
      baseY + bobY * (1 - aim * 0.85) + this._swayY * (1 - aim * 0.7) + reloadY - this._recoilKick * 0.22,
      baseZ + this._recoilKick * 0.11
    );
    this.root.rotation.set(
      THREE.MathUtils.lerp(this.restRotation.x, pose.pitch, aim) - this._recoilKick * 1.25 + this._swayY * 2 * (1 - aim * 0.75),
      THREE.MathUtils.lerp(this.restRotation.y, pose.yaw, aim) + this._swayX * 2 * (1 - aim * 0.75),
      THREE.MathUtils.lerp(this.restRotation.z, pose.roll, aim) + bobX * 0.6 * (1 - aim)
    );
    const hipScale = 1;
    const aimScale = RENDER_CONFIG.AIM.WEAPON_SCALE;
    this.root.scale.setScalar(THREE.MathUtils.lerp(hipScale, aimScale, aim));
  }

  setVisible(v) {
    this.visible = v;
    this.root.visible = v;
  }

  dispose() {
    if (this.anchor.parent === this.viewModelScene) {
      this.viewModelScene.remove(this.anchor);
    } else if (this.camera && this.root.parent === this.camera) {
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
