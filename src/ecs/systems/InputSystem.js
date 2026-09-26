// src/ecs/systems/InputSystem.js

import { INPUT_FLAGS } from '../../config/constants.js';
import { setFlag, clearFlag } from '../../utils/BitFlags.js';

/**
 * InputSystem
 * Captures DOM keyboard, mouse movement, and pointer lock events to construct 
 * bitmask state flags and orientation angles for local player entities.
 */
export class InputSystem {
  /**
   * @param {HTMLElement} domElement - The canvas or window element capturing user input.
   * @param {object} keybindings - Key binding mappings from controls config.
   * @param {object} mouseConfig - Sensitivity and Y-axis inversion configuration.
   */
  constructor(domElement = document.body, keybindings, mouseConfig) {
    this.domElement = domElement;
    this.keybindings = keybindings;
    this.mouseConfig = mouseConfig;

    this.currentInputMask = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.sequence = 0;

    this.isPointerLocked = false;
    this.keyStateMap = new Map();

    this._bindEvents();
  }

  /**
   * Binds DOM event listeners for keyboard, mouse movement, and pointer locking.
   * @private
   */
  _bindEvents() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    this.domElement.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.domElement.requestPointerLock();
      }
    });
  }

  _onKeyDown(event) {
    if (event.repeat) return;
    this.keyStateMap.set(event.code, true);
    this._updateMaskFromKey(event.code, true);
  }

  _onKeyUp(event) {
    this.keyStateMap.set(event.code, false);
    this._updateMaskFromKey(event.code, false);
  }

  _onMouseDown(event) {
    if (!this.isPointerLocked) return;
    if (event.button === 0) { // Primary left click
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

    const sensitivity = this.mouseConfig.SENSITIVITY;
    const invertY = this.mouseConfig.INVERT_Y ? -1 : 1;

    // Horizontal rotation (Yaw) around Y axis
    this.yaw -= event.movementX * sensitivity;
    // Normalize yaw to [-PI, PI] range
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));

    // Vertical look tilt (Pitch) with clamping [-89°, +89°]
    const pitchDelta = event.movementY * sensitivity * invertY;
    const maxPitch = (89 * Math.PI) / 180;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - pitchDelta));
  }

  /**
   * Maps key code strings to input bitwise flags.
   * @private
   */
  _updateMaskFromKey(code, isPressed) {
    let flag = 0;
    switch (code) {
      case this.keybindings.MOVE_FORWARD:
        flag = INPUT_FLAGS.FORWARD;
        break;
      case this.keybindings.MOVE_BACKWARD:
        flag = INPUT_FLAGS.BACKWARD;
        break;
      case this.keybindings.MOVE_LEFT:
        flag = INPUT_FLAGS.LEFT;
        break;
      case this.keybindings.MOVE_RIGHT:
        flag = INPUT_FLAGS.RIGHT;
        break;
      case this.keybindings.JUMP:
        flag = INPUT_FLAGS.JUMP;
        break;
      case this.keybindings.CROUCH:
        flag = INPUT_FLAGS.CROUCH;
        break;
      case this.keybindings.RELOAD:
        flag = INPUT_FLAGS.RELOAD;
        break;
    }

    if (flag !== 0) {
      this.currentInputMask = isPressed
        ? setFlag(this.currentInputMask, flag)
        : clearFlag(this.currentInputMask, flag);
    }
  }

  /**
   * Main System update loop called per frame.
   * Updates local player Input component with the latest frame sequence and data.
   * 
   * @param {object} ecsWorld 
   * @param {Array<number>} localPlayerEntities 
   */
  update(ecsWorld, localPlayerEntities) {
    this.sequence++;

    for (let i = 0; i < localPlayerEntities.length; i++) {
      const entityId = localPlayerEntities[i];
      const inputComp = ecsWorld.getComponent(entityId, 'Input');

      if (inputComp) {
        inputComp.inputMask = this.currentInputMask;
        inputComp.yaw = this.yaw;
        inputComp.pitch = this.pitch;
        inputComp.sequence = this.sequence;
      }
    }
  }
}