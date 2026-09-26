// src/ecs/systems/InputSystem.js

import { INPUT_FLAGS, STANCE } from '../../config/constants.js';
import { DEFAULT_KEYBINDINGS, MOUSE_CONFIG } from '../../config/controls.js';
import { setFlag, clearFlag } from '../../utils/BitFlags.js';

export class InputSystem {
  constructor(domElement = document.body, keybindings = DEFAULT_KEYBINDINGS, mouseConfig = MOUSE_CONFIG) {
    this.domElement = domElement || document.body;
    this.keybindings = keybindings || DEFAULT_KEYBINDINGS;
    this.mouseConfig = mouseConfig || MOUSE_CONFIG;

    this.currentInputMask = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.sequence = 0;
    this.weaponSlot = -1;
    this.stance = STANCE.STAND;

    this.isPointerLocked = false;
    this.keyStateMap = new Map();
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    if (this.domElement) {
      this.domElement.addEventListener('click', () => {
        if (!this.isPointerLocked && this.domElement.requestPointerLock) {
          this.domElement.requestPointerLock();
        }
      });
    }
  }

  _onKeyDown(event) {
    if (event.repeat) return;
    this.keyStateMap.set(event.code, true);
    this._updateMaskFromKey(event.code, true);

    const b = this.keybindings || DEFAULT_KEYBINDINGS;
    if (event.code === b.WEAPON_1 || event.code === 'Digit1') this.weaponSlot = 0;
    if (event.code === b.WEAPON_2 || event.code === 'Digit2') this.weaponSlot = 1;
    if (event.code === b.WEAPON_3 || event.code === 'Digit3') this.weaponSlot = 2;
    if (event.code === b.WEAPON_4 || event.code === 'Digit4') this.weaponSlot = 3;

    // Toggle crouch / prone
    if (event.code === b.CROUCH || event.code === 'KeyC') {
      this.stance =
        this.stance === STANCE.CROUCH ? STANCE.STAND : STANCE.CROUCH;
    }
    if (event.code === b.PRONE || event.code === 'KeyZ') {
      this.stance =
        this.stance === STANCE.PRONE ? STANCE.STAND : STANCE.PRONE;
    }
  }

  _onKeyUp(event) {
    this.keyStateMap.set(event.code, false);
    this._updateMaskFromKey(event.code, false);
  }

  _onMouseDown(event) {
    if (!this.isPointerLocked) return;
    if (event.button === 0) {
      this.currentInputMask = setFlag(this.currentInputMask, INPUT_FLAGS.SHOOT);
    }
  }

  _onMouseUp(event) {
    if (event.button === 0) {
      this.currentInputMask = clearFlag(this.currentInputMask, INPUT_FLAGS.SHOOT);
    }
  }

  _onMouseMove(event) {
    if (!this.isPointerLocked) return;
    const sensitivity = this.mouseConfig?.SENSITIVITY ?? 0.002;
    const invertY = this.mouseConfig?.INVERT_Y ? -1 : 1;
    this.yaw -= event.movementX * sensitivity;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    const pitchDelta = event.movementY * sensitivity * invertY;
    const maxPitch = (89 * Math.PI) / 180;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - pitchDelta));
  }

  _updateMaskFromKey(code, isPressed) {
    let flag = 0;
    const bindings = this.keybindings || DEFAULT_KEYBINDINGS;
    switch (code) {
      case bindings.MOVE_FORWARD: flag = INPUT_FLAGS.FORWARD; break;
      case bindings.MOVE_BACKWARD: flag = INPUT_FLAGS.BACKWARD; break;
      case bindings.MOVE_LEFT: flag = INPUT_FLAGS.LEFT; break;
      case bindings.MOVE_RIGHT: flag = INPUT_FLAGS.RIGHT; break;
      case bindings.JUMP: flag = INPUT_FLAGS.JUMP; break;
      case bindings.RELOAD: flag = INPUT_FLAGS.RELOAD; break;
    }
    if (flag !== 0) {
      this.currentInputMask = isPressed
        ? setFlag(this.currentInputMask, flag)
        : clearFlag(this.currentInputMask, flag);
    }
  }

  update(ecsWorld, localPlayerEntity = null) {
    this.sequence++;

    // Encode stance into mask for systems that read flags
    let mask = this.currentInputMask;
    mask = clearFlag(mask, INPUT_FLAGS.CROUCH);
    mask = clearFlag(mask, INPUT_FLAGS.PRONE);
    if (this.stance === STANCE.CROUCH) mask = setFlag(mask, INPUT_FLAGS.CROUCH);
    if (this.stance === STANCE.PRONE) mask = setFlag(mask, INPUT_FLAGS.PRONE);

    const slot = this.weaponSlot;
    this.weaponSlot = -1;

    const inputPayload = {
      sequence: this.sequence,
      inputMask: mask,
      yaw: this.yaw,
      pitch: this.pitch,
      weaponSlot: slot,
      stance: this.stance,
    };

    if (localPlayerEntity?.input) {
      localPlayerEntity.input.inputMask = mask;
      localPlayerEntity.input.yaw = this.yaw;
      localPlayerEntity.input.pitch = this.pitch;
      localPlayerEntity.input.sequence = this.sequence;
      localPlayerEntity.input.weaponSlot = slot;
      localPlayerEntity.input.stance = this.stance;
      return inputPayload;
    }

    for (const entity of ecsWorld.with('player', 'input')) {
      if (entity.player?.isLocal) {
        entity.input.inputMask = mask;
        entity.input.yaw = this.yaw;
        entity.input.pitch = this.pitch;
        entity.input.sequence = this.sequence;
        entity.input.weaponSlot = slot;
        entity.input.stance = this.stance;
      }
    }

    return inputPayload;
  }
}
