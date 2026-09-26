// src/ui/HUD.js

/**
 * HUD (Heads-Up Display)
 * Manages the non-ECS DOM user interface overlays for in-game client state,
 * including health status, ammunition counters, crosshair, and death notifications.
 */
export class HUD {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      user-select: none;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #ffffff;
      display: none;
    `;

    this._createDOMStructure();
    document.body.appendChild(this.container);
  }

  /**
   * Constructs HUD DOM elements.
   * @private
   */
  _createDOMStructure() {
    this.container.innerHTML = `
      <!-- Crosshair -->
      <div id="crosshair" style="
        position: absolute;
        top: 50%;
        left: 50%;
        width: 10px;
        height: 10px;
        transform: translate(-50%, -50%);
        pointer-events: none;
      ">
        <div style="position: absolute; top: 4px; left: 0; width: 10px; height: 2px; background: rgba(255, 255, 255, 0.8);"></div>
        <div style="position: absolute; top: 0; left: 4px; width: 2px; height: 10px; background: rgba(255, 255, 255, 0.8);"></div>
      </div>

      <!-- Bottom-Left Status Container -->
      <div style="
        position: absolute;
        bottom: 30px;
        left: 30px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">
        <!-- Health Bar -->
        <div style="display: flex; align-items: center; gap: 12px; background: rgba(0, 0, 0, 0.5); padding: 10px 16px; border-radius: 6px; backdrop-filter: blur(4px);">
          <span style="font-weight: bold; font-size: 14px; color: #ff4757; letter-spacing: 1px;">HP</span>
          <div style="width: 180px; height: 14px; background: rgba(255, 255, 255, 0.2); border-radius: 7px; overflow: hidden;">
            <div id="hud-health-bar" style="width: 100%; height: 100%; background: #2ed573; transition: width 0.15s ease-out;"></div>
          </div>
          <span id="hud-health-val" style="font-size: 18px; font-weight: bold; width: 40px;">100</span>
        </div>

        <!-- Ammo Count -->
        <div style="display: flex; align-items: center; gap: 12px; background: rgba(0, 0, 0, 0.5); padding: 10px 16px; border-radius: 6px; backdrop-filter: blur(4px); width: fit-content;">
          <span style="font-weight: bold; font-size: 14px; color: #ffa502; letter-spacing: 1px;">AMMO</span>
          <span id="hud-ammo-val" style="font-size: 22px; font-weight: bold; letter-spacing: 2px;">30 / ∞</span>
        </div>
      </div>

      <!-- Death Banner Overlay -->
      <div id="hud-death-overlay" style="
        position: absolute;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        display: none;
      ">
        <h1 style="font-size: 48px; color: #ff4757; margin: 0; text-shadow: 0 0 10px rgba(255, 71, 87, 0.5);">ELIMINATED</h1>
        <p style="font-size: 18px; color: #ccc; margin-top: 8px;">Respawning in authoritative session...</p>
      </div>
    `;

    this.healthBar = document.getElementById('hud-health-bar');
    this.healthVal = document.getElementById('hud-health-val');
    this.ammoVal = document.getElementById('hud-ammo-val');
    this.deathOverlay = document.getElementById('hud-death-overlay');
  }

  /**
   * Toggles HUD visibility.
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this.container.style.display = visible ? 'block' : 'none';
  }

  /**
   * Updates health bar UI component.
   * @param {number} current 
   * @param {number} max 
   */
  updateHealth(current, max = 100) {
    const clamped = Math.max(0, Math.min(max, current));
    const percent = (clamped / max) * 100;

    this.healthBar.style.width = `${percent}%`;
    this.healthVal.textContent = Math.ceil(clamped);

    if (percent > 50) {
      this.healthBar.style.background = '#2ed573';
    } else if (percent > 25) {
      this.healthBar.style.background = '#ffa502';
    } else {
      this.healthBar.style.background = '#ff4757';
    }
  }

  /**
   * Updates ammo counter UI component.
   * @param {number} current 
   * @param {number} max 
   */
  updateAmmo(current, max) {
    this.ammoVal.textContent = `${current} / ${max}`;
  }

  /**
   * Shows or hides the elimination banner.
   * @param {boolean} isDead 
   */
  setDeathOverlay(isDead) {
    this.deathOverlay.style.display = isDead ? 'block' : 'none';
  }

  /**
   * Cleans up HUD elements from DOM.
   */
  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}