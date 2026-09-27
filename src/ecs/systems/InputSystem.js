import { INPUT_FLAGS, STANCE } from '../../config/index.js';
import { DEFAULT_KEYBINDINGS, MOUSE_CONFIG } from '../../config/controls.js';
import { setFlag, clearFlag } from '../../utils/BitFlags.js';

export class InputSystem {
  constructor(
    domElement = document.body,
    keybindings = DEFAULT_KEYBINDINGS,
    mouseConfig = MOUSE_CONFIG
  ) {
    this.domElement = domElement || document.body;
    this.keybindings = keybindings || DEFAULT_KEYBINDINGS;
    this.mouseConfig = mouseConfig || MOUSE_CONFIG;

    this.currentInputMask = 0;
    this.isAiming = false;
    this.yaw = 0;
    this.pitch = 0;
    this.sequence = 0;
    this.weaponSlot = -1;
    this.stance = STANCE.STAND;
    this.isAiming = false;
    this.isPointerLocked = false;
    this.keyStateMap = new Map();
    this.disposed = false;

    this._onKeyDownBound = (e) => this._onKeyDown(e);
    this._onKeyUpBound = (e) => this._onKeyUp(e);
    this._onMouseDownBound = (e) => this._onMouseDown(e);
    this._onMouseUpBound = (e) => this._onMouseUp(e);
    this._onMouseMoveBound = (e) => this._onMouseMove(e);
    this._onContextMenuBound = (e) => e.preventDefault();
    this._onPointerLockChangeBound = () => {
      this.isPointerLocked =
        document.pointerLockElement === this.domElement;
    };
    this._onDomClickBound = () => {
      if (
        !this.disposed &&
        !this.isPointerLocked &&
        this.domElement?.requestPointerLock
      ) {
        this.domElement.requestPointerLock();
      }
    };

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', this._onKeyDownBound);
    window.addEventListener('keyup', this._onKeyUpBound);
    window.addEventListener('mousedown', this._onMouseDownBound);
    window.addEventListener('mouseup', this._onMouseUpBound);
    window.addEventListener('mousemove', this._onMouseMoveBound);
    window.addEventListener('contextmenu', this._onContextMenuBound);
    document.addEventListener(
      'pointerlockchange',
      this._onPointerLockChangeBound
    );
    this.domElement?.addEventListener('click', this._onDomClickBound);
  }

  _onKeyDown(event) {
    if (this.disposed || event.repeat) return;
    this.keyStateMap.set(event.code, true);
    this._updateMaskFromKey(event.code, true);

    const b = this.keybindings;
    if (event.code === b.WEAPON_1 || event.code === 'Digit1') this.weaponSlot = 0;
    if (event.code === b.WEAPON_2 || event.code === 'Digit2') this.weaponSlot = 1;
    if (event.code === b.WEAPON_3 || event.code === 'Digit3') this.weaponSlot = 2;
    if (event.code === b.WEAPON_4 || event.code === 'Digit4') this.weaponSlot = 3;

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
    if (this.disposed) return;
    this.keyStateMap.set(event.code, false);
    this._updateMaskFromKey(event.code, false);
  }

  _onMouseDown(event) {
    if (!this.isPointerLocked || this.disposed) return;
    if (event.button === 2) {
      this.isAiming = true;
      return;
    }
    if (event.button !== 0) return;
    this.currentInputMask = setFlag(this.currentInputMask, INPUT_FLAGS.SHOOT);
  }

  _onMouseUp(event) {
    if (this.disposed) return;
    if (event.button === 2) {
      this.isAiming = false;
      return;
    }
    if (event.button !== 0) return;
    this.currentInputMask = clearFlag(this.currentInputMask, INPUT_FLAGS.SHOOT);
  }

  _onMouseMove(event) {
    if (!this.isPointerLocked || this.disposed) return;
    const sensitivity = (this.mouseConfig?.SENSITIVITY ?? 0.002) *
      (this.isAiming ? (this.mouseConfig?.AIM_SENSITIVITY_MULTIPLIER ?? 0.65) : 1);
    const invertY = this.mouseConfig?.INVERT_Y ? -1 : 1;
    const maxPitch = (89 * Math.PI) / 180;

    this.yaw = Math.atan2(
      Math.sin(this.yaw - event.movementX * sensitivity),
      Math.cos(this.yaw - event.movementX * sensitivity)
    );

    const pitchDelta = event.movementY * sensitivity * invertY;
    this.pitch = Math.max(
      -maxPitch,
      Math.min(maxPitch, this.pitch - pitchDelta)
    );
  }

  _updateMaskFromKey(code, isPressed) {
    let flag = 0;
    const b = this.keybindings;
    switch (code) {
      case b.MOVE_FORWARD: flag = INPUT_FLAGS.FORWARD; break;
      case b.MOVE_BACKWARD: flag = INPUT_FLAGS.BACKWARD; break;
      case b.MOVE_LEFT: flag = INPUT_FLAGS.LEFT; break;
      case b.MOVE_RIGHT: flag = INPUT_FLAGS.RIGHT; break;
      case b.JUMP: flag = INPUT_FLAGS.JUMP; break;
      case b.RELOAD: flag = INPUT_FLAGS.RELOAD; break;
      default: break;
    }

    if (flag) {
      this.currentInputMask = isPressed
        ? setFlag(this.currentInputMask, flag)
        : clearFlag(this.currentInputMask, flag);
    }
  }

  /**
   * Sample once per simulation tick, not once per render frame.
   */
  sample(ecsWorld, localPlayerEntity = null) {
    if (this.disposed) return null;

    this.sequence = (this.sequence + 1) >>> 0;

    let mask = this.currentInputMask;
    mask = clearFlag(mask, INPUT_FLAGS.CROUCH);
    mask = clearFlag(mask, INPUT_FLAGS.PRONE);
    if (this.stance === STANCE.CROUCH) mask = setFlag(mask, INPUT_FLAGS.CROUCH);
    if (this.stance === STANCE.PRONE) mask = setFlag(mask, INPUT_FLAGS.PRONE);

    const slot = this.weaponSlot;
    this.weaponSlot = -1;

    const payload = {
      sequence: this.sequence,
      inputMask: mask,
      yaw: this.yaw,
      pitch: this.pitch,
      isAiming: this.isAiming,
      weaponSlot: slot,
      stance: this.stance,
    };

    let entity = localPlayerEntity?.input ? localPlayerEntity : null;
    if (!entity) {
      for (const candidate of ecsWorld.with('player', 'input')) {
        if (candidate.player?.isLocal) {
          entity = candidate;
          break;
        }
      }
    }

    if (entity?.input) {
      Object.assign(entity.input, payload);
    }

    return payload;
  }

  update(ecsWorld, localPlayerEntity = null) {
    return this.sample(ecsWorld, localPlayerEntity);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('keydown', this._onKeyDownBound);
    window.removeEventListener('keyup', this._onKeyUpBound);
    window.removeEventListener('mousedown', this._onMouseDownBound);
    window.removeEventListener('mouseup', this._onMouseUpBound);
    window.removeEventListener('mousemove', this._onMouseMoveBound);
    window.removeEventListener('contextmenu', this._onContextMenuBound);
    document.removeEventListener(
      'pointerlockchange',
      this._onPointerLockChangeBound
    );
    this.domElement?.removeEventListener('click', this._onDomClickBound);

    this.keyStateMap.clear();
    this.currentInputMask = 0;
  }
}
