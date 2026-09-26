// src/audio/AudioManager.js

/**
 * Procedural SFX via Web Audio API (no external assets required).
 * Unlock on first user gesture (pointer lock / click).
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._unlocked = false;
    this._footstepTimer = 0;
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from click / pointer-lock so browsers allow audio */
  unlock() {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this._unlocked = true;
  }

  _noiseBuffer(duration = 0.08) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _playTone(freq, duration, type = 'square', gain = 0.2, freqEnd = null) {
    if (!this.enabled || !this._ensure() || !this._unlocked) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + duration);
    }
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _playNoise(duration, gain = 0.15, filterFreq = 2000) {
    if (!this.enabled || !this._ensure() || !this._unlocked) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  playShoot() {
    this._playNoise(0.07, 0.28, 1800);
    this._playTone(180, 0.06, 'sawtooth', 0.12, 60);
  }

  playEmptyClick() {
    this._playTone(400, 0.04, 'square', 0.08, 200);
  }

  playReloadStart() {
    this._playTone(220, 0.08, 'triangle', 0.1, 160);
    setTimeout(() => this._playNoise(0.05, 0.08, 1200), 120);
  }

  playReloadEnd() {
    this._playTone(320, 0.06, 'square', 0.12, 280);
    this._playNoise(0.04, 0.1, 2500);
  }

  playFootstep() {
    this._playNoise(0.04, 0.07, 400);
    this._playTone(90, 0.05, 'sine', 0.05, 50);
  }

  playJump() {
    this._playTone(150, 0.12, 'sine', 0.1, 280);
  }

  playLand() {
    this._playNoise(0.06, 0.12, 300);
  }

  playHit() {
    this._playTone(90, 0.1, 'sawtooth', 0.15, 40);
    this._playNoise(0.08, 0.12, 800);
  }

  playDeath() {
    this._playTone(200, 0.35, 'sawtooth', 0.18, 40);
  }

  playImpact() {
    this._playNoise(0.05, 0.1, 1500);
  }

  /** Call each frame while moving on ground */
  updateFootsteps(dt, isMoving, isGrounded) {
    if (!isMoving || !isGrounded) {
      this._footstepTimer = 0;
      return;
    }
    this._footstepTimer += dt;
    if (this._footstepTimer >= 0.38) {
      this._footstepTimer = 0;
      this.playFootstep();
    }
  }
}

/** Singleton shared across host/client */
export const audio = new AudioManager();
