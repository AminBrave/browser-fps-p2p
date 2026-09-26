// src/ecs/systems/InputSystem.js

import { INPUT_FLAGS } from '../../config/constants.js';
import { DEFAULT_KEYBINDINGS, MOUSE_CONFIG } from '../../config/controls.js';
import { setFlag, clearFlag } from '../../utils/BitFlags.js';

/**
 * InputSystem
 * Captures DOM keyboard, mouse movement, and pointer lock events to construct 
 * bitmask state flags and orientation angles for local player entities.
 */
export class InputSystem {
  /**
   * @param {HTMLElement} [domElement=document.body] - Canvas or window element capturing user input.
   * @param {object} [keybindings=DEFAULT_KEYBINDINGS] - Key binding mappings from controls config.
   * @param {object} [mouseConfig=MOUSE_CONFIG] - Sensitivity and Y-axis inversion configuration.
   */
  constructor(domElement = document.body, keybindings = DEFAULT_KEYBINDINGS, mouseConfig = MOUSE_CONFIG) {
    this.domElement = domElement || document.body;
    this.keybindings = keybindings || DEFAULT_KEYBINDINGS;
    this.mouseConfig = mouseConfig || MOUSE_CONFIG;

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

    if (this.domElement) {
      this.domElement.addEventListener('click', () => {
        if (!this.isPointerLocked && typeof this.domElement.requestPointerLock === 'function') {
          this.domElement.requestPointerLock();
        }
      });
    }
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

    const sensitivity = this.mouseConfig?.SENSITIVITY ?? 0.002;
    const invertY = this.mouseConfig?.INVERT_Y ? -1 : 1;

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
    const bindings = this.keybindings || DEFAULT_KEYBINDINGS;

    switch (code) {
      case bindings.MOVE_FORWARD:
        flag = INPUT_FLAGS.FORWARD;
        break;
      case bindings.MOVE_BACKWARD:
        flag = INPUT_FLAGS.BACKWARD;
        break;
      case bindings.MOVE_LEFT:
        flag = INPUT_FLAGS.LEFT;
        break;
      case bindings.MOVE_RIGHT:
        flag = INPUT_FLAGS.RIGHT;
        break;
      case bindings.JUMP:
        flag = INPUT_FLAGS.JUMP;
        break;
      case bindings.CROUCH:
        flag = INPUT_FLAGS.CROUCH;
        break;
      case bindings.RELOAD:
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
   * Synchronizes local entity input component and returns the current frame input payload object.
   * 
   * @param {object} ecsWorld - Miniplex world instance.
   * @param {object|Array|number} [localPlayerEntity] - Local player entity object or ID.
   * @returns {object} Current input payload frame.
   */
  update(ecsWorld, localPlayerEntity = null) {
    this.sequence++;

    // Construct input payload snapshot for prediction/networking
    const inputPayload = {
      sequence: this.sequence,
      inputMask: this.currentInputMask,
      yaw: this.yaw,
      pitch: this.pitch,
    };

    // 1. Direct local player entity object supplied
    if (localPlayerEntity && typeof localPlayerEntity === 'object' && localPlayerEntity.input) {
      localPlayerEntity.input.inputMask = this.currentInputMask;
      localPlayerEntity.input.yaw = this.yaw;
      localPlayerEntity.input.pitch = this.pitch;
      localPlayerEntity.input.sequence = this.sequence;
      return inputPayload;
    }

    // 2. Fallback: Query local player entities using Miniplex v2
    const players = ecsWorld.with('player', 'input');
    for (const entity of players) {
      if (entity.player && entity.player.isLocal) {
        entity.input.inputMask = this.currentInputMask;
        entity.input.yaw = this.yaw;
        entity.input.pitch = this.pitch;
        entity.input.sequence = this.sequence;
      }
    }

    return inputPayload;
  }
}