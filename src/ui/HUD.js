// src/ui/HUD.js

/**
 * HUD — health, ammo, crosshair, death, reload status.
 */
export class HUD {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      user-select: none;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #ffffff;
      display: none;
    `;

    this._createDOMStructure();
    document.body.appendChild(this.container);
  }

  _createDOMStructure() {
    this.container.innerHTML = `
      <div id="crosshair" style="
        position: absolute; top: 50%; left: 50%;
        width: 14px; height: 14px;
        transform: translate(-50%, -50%);
      ">
        <div style="position:absolute;top:6px;left:0;width:14px;height:2px;background:rgba(255,255,255,0.85);"></div>
        <div style="position:absolute;top:0;left:6px;width:2px;height:14px;background:rgba(255,255,255,0.85);"></div>
      </div>

      <div style="
        position: absolute; bottom: 30px; left: 30px;
        display: flex; flex-direction: column; gap: 10px;
      ">
        <div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.5);padding:10px 16px;border-radius:6px;backdrop-filter:blur(4px);">
          <span style="font-weight:bold;font-size:14px;color:#ff4757;letter-spacing:1px;">HP</span>
          <div style="width:180px;height:14px;background:rgba(255,255,255,0.2);border-radius:7px;overflow:hidden;">
            <div id="hud-health-bar" style="width:100%;height:100%;background:#2ed573;transition:width 0.15s ease-out;"></div>
          </div>
          <span id="hud-health-val" style="font-size:18px;font-weight:bold;width:40px;">100</span>
        </div>

        <div style="display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.5);padding:10px 16px;border-radius:6px;backdrop-filter:blur(4px);width:fit-content;">
          <span style="font-weight:bold;font-size:14px;color:#ffa502;letter-spacing:1px;">AMMO</span>
          <span id="hud-ammo-val" style="font-size:22px;font-weight:bold;letter-spacing:2px;">12 / 12</span>
          <span id="hud-reload-val" style="font-size:13px;color:#70a1ff;margin-left:8px;display:none;">RELOADING...</span>
        </div>
      </div>

      <div id="hud-hitmarker" style="
        position:absolute;top:50%;left:50%;
        width:20px;height:20px;
        transform:translate(-50%,-50%);
        display:none;pointer-events:none;
      ">
        <div style="position:absolute;top:0;left:8px;width:4px;height:6px;background:#fff;"></div>
        <div style="position:absolute;bottom:0;left:8px;width:4px;height:6px;background:#fff;"></div>
        <div style="position:absolute;left:0;top:8px;width:6px;height:4px;background:#fff;"></div>
        <div style="position:absolute;right:0;top:8px;width:6px;height:4px;background:#fff;"></div>
      </div>

      <div id="hud-death-overlay" style="
        position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);
        text-align:center;display:none;
      ">
        <h1 style="font-size:48px;color:#ff4757;margin:0;text-shadow:0 0 10px rgba(255,71,87,0.5);">ELIMINATED</h1>
        <p style="font-size:18px;color:#ccc;margin-top:8px;">Respawning...</p>
      </div>
    `;

    this.healthBar = this.container.querySelector('#hud-health-bar');
    this.healthVal = this.container.querySelector('#hud-health-val');
    this.ammoVal = this.container.querySelector('#hud-ammo-val');
    this.reloadVal = this.container.querySelector('#hud-reload-val');
    this.deathOverlay = this.container.querySelector('#hud-death-overlay');
    this.hitmarker = this.container.querySelector('#hud-hitmarker');
  }

  setVisible(visible) {
    this.container.style.display = visible ? 'block' : 'none';
  }

  updateHealth(current, max = 100) {
    const clamped = Math.max(0, Math.min(max, current));
    const percent = (clamped / max) * 100;
    this.healthBar.style.width = `${percent}%`;
    this.healthVal.textContent = Math.ceil(clamped);
    if (percent > 50) this.healthBar.style.background = '#2ed573';
    else if (percent > 25) this.healthBar.style.background = '#ffa502';
    else this.healthBar.style.background = '#ff4757';
  }

  updateAmmo(current, max, isReloading = false) {
    this.ammoVal.textContent = `${current} / ${max}`;
    if (this.reloadVal) {
      this.reloadVal.style.display = isReloading ? 'inline' : 'none';
    }
  }

  showHitmarker() {
    if (!this.hitmarker) return;
    this.hitmarker.style.display = 'block';
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      this.hitmarker.style.display = 'none';
    }, 80);
  }

  setDeathOverlay(isDead) {
    this.deathOverlay.style.display = isDead ? 'block' : 'none';
  }

  dispose() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
