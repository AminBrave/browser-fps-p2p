// src/ui/HUD.js

import { HUD_HINTS } from '../config/controls.js';
import { RENDER_CONFIG } from '../config/index.js';

export class HUD {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      pointer-events:none;user-select:none;
      font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;
      color:#fff;display:none;
    `;
    this._createDOMStructure();
    document.body.appendChild(this.container);
  }

  _createDOMStructure() {
    const hintsHtml = (HUD_HINTS || [])
      .map(
        (h) =>
          `<div style="opacity:0.75;font-size:11px;letter-spacing:0.3px;">${h}</div>`
      )
      .join('');

    this.container.innerHTML = `
      <div id="crosshair" style="position:absolute;top:50%;left:50%;width:0;height:0;transform:translate(-50%,-50%);">
        <div data-crosshair-part="top" style="position:absolute;width:3px;height:6px;background:rgba(255,255,255,0.95);"></div>
        <div data-crosshair-part="right" style="position:absolute;width:6px;height:3px;background:rgba(255,255,255,0.95);"></div>
        <div data-crosshair-part="bottom" style="position:absolute;width:3px;height:6px;background:rgba(255,255,255,0.95);"></div>
        <div data-crosshair-part="left" style="position:absolute;width:6px;height:3px;background:rgba(255,255,255,0.95);"></div>
      </div>

      <div id="hud-scoreboard" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:rgba(0,0,0,0.42);padding:7px 14px;border-radius:8px;backdrop-filter:blur(6px);font-weight:700;letter-spacing:1px;">
        <span style="color:#7bed9f;">KILLS <b id="hud-kills">0</b></span>
        <span style="color:#ff6b81;">DEATHS <b id="hud-deaths">0</b></span>
        <span style="color:#dfe4ea;">K/D <b id="hud-kd">0.00</b></span>
      </div>

      <div style="position:absolute;top:16px;right:20px;text-align:right;background:rgba(0,0,0,0.35);padding:10px 14px;border-radius:8px;backdrop-filter:blur(6px);line-height:1.55;">
        <div style="font-size:10px;color:#70a1ff;font-weight:bold;margin-bottom:4px;letter-spacing:1px;">CONTROLS</div>
        ${hintsHtml}
      </div>

      <div style="position:absolute;bottom:30px;left:30px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.45);padding:10px 16px;border-radius:8px;backdrop-filter:blur(6px);">
          <span style="font-weight:bold;font-size:13px;color:#ff6b6b;">HP</span>
          <div style="width:180px;height:14px;background:rgba(255,255,255,0.15);border-radius:7px;overflow:hidden;">
            <div id="hud-health-bar" style="width:100%;height:100%;background:#2ed573;transition:width 0.12s;"></div>
          </div>
          <span id="hud-health-val" style="font-size:18px;font-weight:bold;width:40px;">100</span>
        </div>

        <div style="display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.45);padding:10px 16px;border-radius:8px;backdrop-filter:blur(6px);width:fit-content;flex-wrap:wrap;">
          <span id="hud-weapon-name" style="font-weight:bold;font-size:13px;color:#7bed9f;min-width:70px;">Pistol</span>
          <span style="font-weight:bold;font-size:13px;color:#ffa502;">AMMO</span>
          <span id="hud-ammo-val" style="font-size:22px;font-weight:bold;letter-spacing:1px;">12 / 36</span>
          <span id="hud-firemode" style="font-size:11px;color:#a4b0be;border:1px solid #57606f;padding:2px 6px;border-radius:4px;">SEMI</span>
          <span id="hud-stance" style="font-size:11px;color:#eccc68;border:1px solid #57606f;padding:2px 6px;border-radius:4px;">STAND</span>
          <span id="hud-reload-val" style="font-size:12px;color:#70a1ff;display:none;">RELOADING...</span>
        </div>

        <div id="hud-weapon-slots" style="display:flex;gap:6px;">
          <div data-slot="0" style="padding:4px 10px;border-radius:4px;background:rgba(46,204,113,0.35);border:1px solid #2ecc71;font-size:11px;">1 Pistol</div>
          <div data-slot="1" style="padding:4px 10px;border-radius:4px;background:rgba(0,0,0,0.35);border:1px solid #57606f;font-size:11px;">2 SMG</div>
          <div data-slot="2" style="padding:4px 10px;border-radius:4px;background:rgba(0,0,0,0.35);border:1px solid #57606f;font-size:11px;">3 Shotgun</div>
          <div data-slot="3" style="padding:4px 10px;border-radius:4px;background:rgba(0,0,0,0.35);border:1px solid #57606f;font-size:11px;">4 Rifle</div>
        </div>
      </div>

      <div id="hud-death-overlay" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);text-align:center;display:none;">
        <h1 style="font-size:48px;color:#ff4757;margin:0;">ELIMINATED</h1>
        <p style="font-size:16px;color:#ccc;margin-top:8px;">Respawning...</p>
      </div>
    `;

    this.healthBar = this.container.querySelector('#hud-health-bar');
    this.healthVal = this.container.querySelector('#hud-health-val');
    this.ammoVal = this.container.querySelector('#hud-ammo-val');
    this.reloadVal = this.container.querySelector('#hud-reload-val');
    this.fireModeEl = this.container.querySelector('#hud-firemode');
    this.stanceEl = this.container.querySelector('#hud-stance');
    this.weaponNameEl = this.container.querySelector('#hud-weapon-name');
    this.weaponSlots = this.container.querySelector('#hud-weapon-slots');
    this.deathOverlay = this.container.querySelector('#hud-death-overlay');
    this.killsEl = this.container.querySelector('#hud-kills');
    this.deathsEl = this.container.querySelector('#hud-deaths');
    this.kdEl = this.container.querySelector('#hud-kd');
    this.crosshair = this.container.querySelector('#crosshair');
    this.crosshairParts = Array.from(this.crosshair?.children || []);
  }

  updateCrosshair(speed = 0, isAiming = false) {
    if (!this.crosshair) return;

    const cfg = RENDER_CONFIG.CROSSHAIR;
    const safeSpeed = Number.isFinite(Number(speed)) ? Math.max(0, Number(speed)) : 0;
    const normalized = Math.max(
      0,
      Math.min(1, (safeSpeed - cfg.MIN_SPEED) / Math.max(0.001, cfg.MAX_SPEED - cfg.MIN_SPEED))
    );

    const targetGap =
      cfg.RESTING_GAP_PX +
      (cfg.MAX_MOVEMENT_GAP_PX - cfg.RESTING_GAP_PX) * normalized;
    const targetLength =
      cfg.RESTING_LENGTH_PX +
      (cfg.MAX_MOVEMENT_LENGTH_PX - cfg.RESTING_LENGTH_PX) * normalized;

    if (this._crosshairGap == null) this._crosshairGap = targetGap;
    if (this._crosshairLength == null) this._crosshairLength = targetLength;

    const response = 1 - Math.exp(-cfg.RESPONSE * (1 / 60));
    this._crosshairGap += (targetGap - this._crosshairGap) * response;
    this._crosshairLength += (targetLength - this._crosshairLength) * response;

    const gap = isAiming ? RENDER_CONFIG.CROSSHAIR.AIM_GAP_PX : this._crosshairGap;
    const length = this._crosshairLength;
    const top = this.crosshairParts[0];
    const right = this.crosshairParts[1];
    const bottom = this.crosshairParts[2];
    const left = this.crosshairParts[3];

    if (top) {
      top.style.width = '3px';
      top.style.height = length + 'px';
      top.style.left = '-1.5px';
      top.style.top = -(gap + length) + 'px';
    }
    if (right) {
      right.style.width = length + 'px';
      right.style.height = '3px';
      right.style.left = gap + 'px';
      right.style.top = '-1.5px';
    }
    if (bottom) {
      bottom.style.width = '3px';
      bottom.style.height = length + 'px';
      bottom.style.left = '-1.5px';
      bottom.style.top = gap + 'px';
    }
    if (left) {
      left.style.width = length + 'px';
      left.style.height = '3px';
      left.style.left = -(gap + length) + 'px';
      left.style.top = '-1.5px';
    }
  }

  setVisible(v) {
    this.container.style.display = v ? 'block' : 'none';
  }

  updateHealth(current, max = 100) {
    const c = Math.max(0, Math.min(max, current));
    const p = (c / max) * 100;
    this.healthBar.style.width = `${p}%`;
    this.healthVal.textContent = Math.ceil(c);
    this.healthBar.style.background =
      p > 50 ? '#2ed573' : p > 25 ? '#ffa502' : '#ff4757';
  }

  updateAmmo(
    magazine,
    reserve,
    isReloading = false,
    fireMode = 'semi',
    weaponName = '',
    activeSlot = 0,
    stanceLabel = 'STAND'
  ) {
    this.ammoVal.textContent = `${magazine} / ${reserve}`;
    if (this.reloadVal) this.reloadVal.style.display = isReloading ? 'inline' : 'none';
    if (this.fireModeEl) this.fireModeEl.textContent = (fireMode || 'semi').toUpperCase();
    if (this.weaponNameEl && weaponName) this.weaponNameEl.textContent = weaponName;
    if (this.stanceEl) this.stanceEl.textContent = stanceLabel;

    if (this.weaponSlots) {
      this.weaponSlots.querySelectorAll('[data-slot]').forEach((el) => {
        const s = Number(el.getAttribute('data-slot'));
        if (s === activeSlot) {
          el.style.background = 'rgba(46,204,113,0.35)';
          el.style.borderColor = '#2ecc71';
        } else {
          el.style.background = 'rgba(0,0,0,0.35)';
          el.style.borderColor = '#57606f';
        }
      });
    }
  }

  updateScoreboard(kills = 0, deaths = 0) {
    const k = Math.max(0, Number(kills) || 0);
    const d = Math.max(0, Number(deaths) || 0);
    if (this.killsEl) this.killsEl.textContent = String(k);
    if (this.deathsEl) this.deathsEl.textContent = String(d);
    if (this.kdEl) this.kdEl.textContent = (d > 0 ? k / d : k).toFixed(2);
  }

  setDeathOverlay(isDead) {
    this.deathOverlay.style.display = isDead ? 'block' : 'none';
  }

  dispose() {
    this.container?.parentNode?.removeChild(this.container);
  }
}
