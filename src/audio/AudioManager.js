// src/audio/AudioManager.js

/** Procedural SFX — distinct profiles per weapon family */
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
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  unlock() {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
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

  _tone(freq, duration, type = 'square', gain = 0.2, freqEnd = null) {
    if (!this.enabled || !this._ensure() || !this._unlocked) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + duration);
    }
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise(duration, gain = 0.15, filterFreq = 2000) {
    if (!this.enabled || !this._ensure() || !this._unlocked) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  /** @param {string} [sfx] pistol|smg|shotgun|rifle */
  playShoot(sfx = 'pistol') {
    switch (sfx) {
      case 'smg':
        this._noise(0.04, 0.18, 2200);
        this._tone(220, 0.04, 'sawtooth', 0.08, 90);
        break;
      case 'shotgun':
        this._noise(0.14, 0.35, 900);
        this._tone(90, 0.12, 'sawtooth', 0.2, 40);
        this._tone(55, 0.18, 'sine', 0.12, 30);
        break;
      case 'rifle':
        this._noise(0.06, 0.28, 1600);
        this._tone(140, 0.07, 'square', 0.14, 50);
        break;
      default: // pistol — sharp crack
        this._noise(0.06, 0.26, 2400);
        this._tone(200, 0.05, 'square', 0.14, 70);
        break;
    }
  }

  playEmptyClick() {
    this._tone(420, 0.035, 'square', 0.07, 180);
  }

  playReloadStart() {
    this._tone(200, 0.07, 'triangle', 0.09, 140);
    setTimeout(() => this._noise(0.04, 0.07, 1100), 100);
  }

  playReloadEnd() {
    this._tone(300, 0.05, 'square', 0.1, 250);
    this._noise(0.03, 0.08, 2200);
  }

  playFootstep(stance = 0) {
    const g = stance === 2 ? 0.03 : stance === 1 ? 0.05 : 0.07;
    this._noise(0.035, g, 380);
    this._tone(80, 0.04, 'sine', g * 0.7, 45);
  }

  playJump() {
    this._tone(140, 0.1, 'sine', 0.09, 260);
  }

  playLand() {
    this._noise(0.05, 0.11, 280);
  }

  playHit() {
    this._tone(85, 0.09, 'sawtooth', 0.14, 35);
    this._noise(0.07, 0.1, 700);
  }

  playDeath() {
    this._tone(180, 0.3, 'sawtooth', 0.16, 35);
  }

  playImpact() {
    this._noise(0.04, 0.09, 1400);
  }

  updateFootsteps(dt, isMoving, isGrounded, stance = 0) {
    if (!isMoving || !isGrounded) {
      this._footstepTimer = 0;
      return;
    }
    const interval = stance === 2 ? 0.55 : stance === 1 ? 0.45 : 0.36;
    this._footstepTimer += dt;
    if (this._footstepTimer >= interval) {
      this._footstepTimer = 0;
      this.playFootstep(stance);
    }
  }
}

export const audio = new AudioManager();
