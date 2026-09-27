// src/audio/AudioManager.js

/** Procedural SFX — distinct profiles per weapon family */
import { AUDIO_CONFIG } from '../config/index.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._unlocked = false;
    this._footstepTimer = 0;
    this._ambienceStarted = false;
    this._ambienceSources = [];
    this._thunderTimer = null;
    this._combatFireTimer = null;
    this._musicTimer = null;
    this._musicStep = 0;
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = AUDIO_CONFIG.MASTER_GAIN;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = AUDIO_CONFIG.SFX_GAIN;
      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = AUDIO_CONFIG.AMBIENCE_GAIN;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      this.sfxBus.connect(this.master);
      this.ambienceBus.connect(this.master);
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  unlock() {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this._unlocked = true;
    this._startCombatAmbience();
  }

  _noiseBuffer(duration = 0.08) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, duration, type = 'square', gain = 0.2, freqEnd = null, output = null) {
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
    g.connect(output || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise(duration, gain = 0.15, filterFreq = 2000, output = null) {
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
    g.connect(output || this.sfxBus);
    src.start(t0);
  }

  /** @param {string} [sfx] pistol|smg|shotgun|rifle */
  playShoot(sfx = 'pistol', output = null) {
    switch (sfx) {
      case 'smg':
        this._noise(0.045, 0.26 * AUDIO_CONFIG.SFX.SHOOT_MULTIPLIER, 2300, output);
        this._tone(220, 0.04, 'sawtooth', 0.08, 90, output);
        break;
      case 'shotgun':
        this._noise(0.16, 0.46 * AUDIO_CONFIG.SFX.SHOOT_MULTIPLIER, 900, output);
        this._tone(90, 0.12, 'sawtooth', 0.2, 40, output);
        this._tone(55, 0.18, 'sine', 0.12, 30, output);
        break;
      case 'rifle':
        this._noise(0.065, 0.38 * AUDIO_CONFIG.SFX.SHOOT_MULTIPLIER, 1600, output);
        this._tone(140, 0.07, 'square', 0.14, 50, output);
        break;
      default: // pistol — sharp crack
        this._noise(0.065, 0.36 * AUDIO_CONFIG.SFX.SHOOT_MULTIPLIER, 2500, output);
        this._tone(200, 0.05, 'square', 0.14, 70, output);
        break;
    }
  }

  _startCombatAmbience() {
    if (!AUDIO_CONFIG.COMBAT_BED.ENABLED || this._ambienceStarted || !this._unlocked || !this.ctx) return;
    this._ambienceStarted = true;

    // Use an original procedural retro combat bed instead of remote audio files.
    // This avoids autoplay/CORS/CDN failures while keeping the soundtrack alive.
    this._startCombatMusic();
    this._scheduleDistantCombatFire();
  }

  _startCombatMusic() {
    if (!AUDIO_CONFIG.MUSIC.ENABLED || this._musicTimer || !this._ambienceStarted) return;
    this._musicStep = 0;

    const schedule = () => {
      if (!this._ambienceStarted || !this._unlocked || !this.ctx) return;
      const cfg = AUDIO_CONFIG.MUSIC;
      const t = this.ctx.currentTime;
      const step = this._musicStep++ % 16;
      const bassNotes = [110, 110, 146.83, 164.81, 110, 130.81, 146.83, 98, 110, 110, 146.83, 164.81, 130.81, 146.83, 196, 146.83];
      const leadNotes = [440, 0, 523.25, 587.33, 0, 523.25, 659.25, 587.33, 440, 0, 523.25, 659.25, 0, 587.33, 783.99, 659.25];

      const bass = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bass.type = 'triangle';
      bass.frequency.setValueAtTime(bassNotes[step], t);
      bassGain.gain.setValueAtTime(cfg.BASS_GAIN, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      bass.connect(bassGain);
      bassGain.connect(this.ambienceBus);
      bass.start(t);
      bass.stop(t + 0.17);

      const leadFreq = leadNotes[step];
      if (leadFreq) {
        const lead = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        lead.type = 'square';
        lead.frequency.setValueAtTime(leadFreq, t);
        leadGain.gain.setValueAtTime(cfg.LEAD_GAIN, t);
        leadGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        lead.connect(leadGain);
        leadGain.connect(this.ambienceBus);
        lead.start(t);
        lead.stop(t + 0.12);
      }

      // Small noise kick on the downbeat gives the loop a game-like pulse.
      if (step % 4 === 0) {
        this._musicPercussion(t, cfg.DRUM_GAIN);
      }
      this._musicTimer = setTimeout(schedule, cfg.STEP_MS);
    };

    schedule();
  }

  _musicPercussion(time, gain = 0.04) {
    const duration = 0.07;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ambienceBus);
    src.start(time);
  }

  _scheduleDistantCombatFire() {
    if (!this._ambienceStarted || !this._unlocked) return;
    const cfg = AUDIO_CONFIG.COMBAT_BED;
    const delay = cfg.DISTANT_FIRE_MIN_DELAY_MS +
      Math.random() * (cfg.DISTANT_FIRE_MAX_DELAY_MS - cfg.DISTANT_FIRE_MIN_DELAY_MS);
    this._combatFireTimer = setTimeout(() => {
      if (!this._ambienceStarted || !this._unlocked) return;
      const shots = 2 + Math.floor(Math.random() * 4);
      const start = this.ctx.currentTime;
      for (let i = 0; i < shots; i++) {
        const offset = i * (0.12 + Math.random() * 0.18);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120 + Math.random() * 80, start + offset);
        osc.frequency.exponentialRampToValueAtTime(48, start + offset + 0.09);
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(cfg.DISTANT_FIRE_GAIN, start + offset + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.12);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ambienceBus);
        osc.start(start + offset);
        osc.stop(start + offset + 0.14);
      }
      this._scheduleDistantCombatFire();
    }, delay);
  }

  stopCombatAmbience() {
    this._ambienceStarted = false;
    if (this._thunderTimer) {
      clearTimeout(this._thunderTimer);
      this._thunderTimer = null;
    }
    if (this._combatFireTimer) {
      clearTimeout(this._combatFireTimer);
      this._combatFireTimer = null;
    }
    if (this._musicTimer) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
    }
    for (const item of this._ambienceSources) {
      try { item.element.pause(); item.element.currentTime = 0; } catch {}
      try { item.source.disconnect(); } catch {}
      try { item.gain.disconnect(); } catch {}
    }
    this._ambienceSources.length = 0;
  }

  _playAt(position, callback) {
    if (!position || !this.enabled || !this._ensure() || !this._unlocked) return;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2;
    panner.maxDistance = 80;
    panner.rolloffFactor = 1;
    panner.positionX.value = Number(position.x) || 0;
    panner.positionY.value = Number(position.y) || 0;
    panner.positionZ.value = Number(position.z) || 0;
    panner.connect(this.sfxBus);
    callback(panner);
    setTimeout(() => { try { panner.disconnect(); } catch {} }, 1200);
  }

  setListener(position, forward = { x: 0, y: 0, z: -1 }) {
    if (!position || !this.ctx) return;
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;
    const set = (param, value) => {
      if (param?.setValueAtTime) param.setValueAtTime(Number(value) || 0, now);
      else if (param) param.value = Number(value) || 0;
    };
    set(listener.positionX, position.x);
    set(listener.positionY, position.y);
    set(listener.positionZ, position.z);
    set(listener.forwardX, forward.x);
    set(listener.forwardY, forward.y);
    set(listener.forwardZ, forward.z);
    set(listener.upX, 0);
    set(listener.upY, 1);
    set(listener.upZ, 0);
  }

  playShootAt(sfx, position) { this._playAt(position, output => this.playShoot(sfx, output)); }
  playImpactAt(position) { this._playAt(position, output => this._noise(0.04, 0.09, 1400, output)); }
  playReloadStartAt(position) { this._playAt(position, output => { this._tone(200, 0.07, 'triangle', 0.09, 140, output); }); }
  playReloadEndAt(position) { this._playAt(position, output => { this._tone(300, 0.05, 'square', 0.1, 250, output); }); }
  playFootstepAt(position, stance = 0) {
    const gain = (stance === 2 ? 0.03 : stance === 1 ? 0.05 : 0.07) * AUDIO_CONFIG.SFX.FOOTSTEP_MULTIPLIER;
    this._playAt(position, output => {
      this._noise(0.035, gain, 380, output);
      this._tone(80, 0.04, 'sine', gain * 0.7, 45, output);
    });
  }

  playJumpAt(position) { this._playAt(position, output => this._tone(140, 0.1, 'sine', 0.09, 260, output)); }
  playLandAt(position) { this._playAt(position, output => this._noise(0.05, 0.11, 280, output)); }
  playHitAt(position) { this._playAt(position, output => { this._tone(85, 0.09, 'sawtooth', 0.14, 35, output); this._noise(0.07, 0.1, 700, output); }); }
  playDeathAt(position) { this._playAt(position, output => this._tone(180, 0.3, 'sawtooth', 0.16, 35, output)); }

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
    const g = (stance === 2 ? 0.03 : stance === 1 ? 0.05 : 0.07) * AUDIO_CONFIG.SFX.FOOTSTEP_MULTIPLIER;
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
    this._noise(0.055, 0.13 * AUDIO_CONFIG.SFX.IMPACT_MULTIPLIER, 1500);
  }

  updateFootsteps(dt, isMoving, isGrounded, stance = 0) {
    if (!isMoving || !isGrounded) {
      this._footstepTimer = 0;
      return false;
    }
    const interval = stance === 2 ? 0.55 : stance === 1 ? 0.45 : 0.36;
    this._footstepTimer += dt;
    if (this._footstepTimer >= interval) {
      this._footstepTimer = 0;
      this.playFootstep(stance);
      return true;
    }
    return false;
  }
}

export const audio = new AudioManager();
