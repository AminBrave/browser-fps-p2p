// src/ui/HUD.js

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
    this.container.innerHTML = `
      <div id="crosshair" style="position:absolute;top:50%;left:50%;width:14px;height:14px;transform:translate(-50%,-50%);">
        <div style="position:absolute;top:6px;left:0;width:14px;height:2px;background:rgba(255,255,255,0.9);"></div>
        <div style="position:absolute;top:0;left:6px;width:2px;height:14px;background:rgba(255,255,255,0.9);"></div>
      </div>

      <div style="position:absolute;bottom:30px;left:30px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.45);padding:10px 16px;border-radius:8px;backdrop-filter:blur(6px);">
          <span style="font-weight:bold;font-size:13px;color:#ff6b6b;">HP</span>
          <div style="width:180px;height:14px;background:rgba(255,255,255,0.15);border-radius:7px;overflow:hidden;">
            <div id="hud-health-bar" style="width:100%;height:100%;background:#2ed573;transition:width 0.12s;"></div>
          </div>
          <span id="hud-health-val" style="font-size:18px;font-weight:bold;width:40px;">100</span>
        </div>

        <div style="display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.45);padding:10px 16px;border-radius:8px;backdrop-filter:blur(6px);width:fit-content;">
          <span style="font-weight:bold;font-size:13px;color:#ffa502;">AMMO</span>
          <span id="hud-ammo-val" style="font-size:22px;font-weight:bold;letter-spacing:1px;">12 / 36</span>
          <span id="hud-firemode" style="font-size:11px;color:#a4b0be;margin-left:6px;border:1px solid #57606f;padding:2px 6px;border-radius:4px;">SEMI</span>
          <span id="hud-reload-val" style="font-size:12px;color:#70a1ff;margin-left:6px;display:none;">RELOADING...</span>
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
    this.deathOverlay = this.container.querySelector('#hud-death-overlay');
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

  /**
   * @param {number} magazine - rounds in mag
   * @param {number} reserve - reserve pool
   * @param {boolean} isReloading
   * @param {string} [fireMode]
   */
  updateAmmo(magazine, reserve, isReloading = false, fireMode = 'semi') {
    this.ammoVal.textContent = `${magazine} / ${reserve}`;
    if (this.reloadVal) {
      this.reloadVal.style.display = isReloading ? 'inline' : 'none';
    }
    if (this.fireModeEl) {
      this.fireModeEl.textContent = (fireMode || 'semi').toUpperCase();
    }
  }

  setDeathOverlay(isDead) {
    this.deathOverlay.style.display = isDead ? 'block' : 'none';
  }

  dispose() {
    this.container?.parentNode?.removeChild(this.container);
  }
}
