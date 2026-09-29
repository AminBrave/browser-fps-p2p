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
      <svg id="crosshair" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
        style="position:fixed;top:50%;left:50%;width:140px;height:140px;transform:translate3d(-50%,-50%,0);overflow:visible;pointer-events:none;z-index:1000;will-change:transform;">
        <g data-crosshair-arms fill="#ffffff" stroke="#000000" stroke-width="0.8">
          <rect data-crosshair-part="top" x="99" y="0" width="2" height="7" rx="1"></rect>
          <rect data-crosshair-part="right" x="193" y="99" width="7" height="2" rx="1"></rect>
          <rect data-crosshair-part="bottom" x="99" y="193" width="2" height="7" rx="1"></rect>
          <rect data-crosshair-part="left" x="0" y="99" width="7" height="2" rx="1"></rect>
        </g>
        <circle data-crosshair-dot cx="100" cy="100" r="1.35" fill="#ffffff" stroke="#000000" stroke-width="0.8"></circle>
      </svg>

      <div id="hud-scoreboard" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:rgba(0,0,0,0.42);padding:7px 14px;border-radius:8px;backdrop-filter:blur(6px);font-weight:700;letter-spacing:1px;">
        <span style="color:#7bed9f;">KILLS <b id="hud-kills">0</b></span>
        <span style="color:#ff6b81;">DEATHS <b id="hud-deaths">0</b></span>
        <span style="color:#dfe4ea;">K/D <b id="hud-kd">0.00</b></span>
      <div id="hud-multiplayer-panel" style="position:absolute;top:60px;left:18px;width:min(390px,calc(100vw - 36px));background:rgba(0,0,0,0.48);border:1px solid rgba(255,255,255,.10);border-radius:9px;backdrop-filter:blur(8px);overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 11px;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;letter-spacing:1px;font-weight:800;color:#70a1ff;">
          <span>MATCH PLAYERS</span>
          <span id="hud-player-count">0/0</span>
        </div>
        <div id="hud-player-list"></div>
        <div id="hud-network-summary" style="padding:7px 11px;border-top:1px solid rgba(255,255,255,.08);font-size:10px;color:#a4b0be;">NETWORK — waiting for telemetry</div>
      </div>

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
    this.multiplayerPanel = this.container.querySelector('#hud-multiplayer-panel');
    this.playerCountEl = this.container.querySelector('#hud-player-count');
    this.playerListEl = this.container.querySelector('#hud-player-list');
    this.networkSummaryEl = this.container.querySelector('#hud-network-summary');
    this._scoreboardVisible = true;
    this._scoreboardKeyHandler = (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      this._scoreboardVisible = !this._scoreboardVisible;
      if (this.multiplayerPanel) this.multiplayerPanel.style.display = this._scoreboardVisible ? 'block' : 'none';
    };
    window.addEventListener('keydown', this._scoreboardKeyHandler);
    this.crosshair = this.container.querySelector('#crosshair');
    this.crosshairParts = [
      this.crosshair?.querySelector('[data-crosshair-part="top"]'),
      this.crosshair?.querySelector('[data-crosshair-part="right"]'),
      this.crosshair?.querySelector('[data-crosshair-part="bottom"]'),
      this.crosshair?.querySelector('[data-crosshair-part="left"]'),
    ];
    this.crosshairDot = this.crosshair?.querySelector('[data-crosshair-dot]');
    this._crosshairGap = 5;
    this._crosshairLength = 7;
    this._crosshairOpacity = 0.96;
    this._crosshairStyle = {};
  }

  updateCrosshair({
    spread = 0,
    spreadMax = 0.05,
    isAiming = false,
    isFiring = false,
    recoil = 0,
    speed01 = 0,
    isSprinting = false,
  } = {}) {
    if (!this.crosshair) return;

    const cfg = { ...RENDER_CONFIG.CROSSHAIR, ...this._crosshairStyle };
    const safeSpread = Math.max(0, Number(spread) || 0);
    const safeMax = Math.max(0.001, Number(spreadMax) || 0.05);
    const spreadT = Math.max(0, Math.min(1, Math.sqrt(safeSpread / safeMax)));
    const movementT = Math.max(0, Math.min(1, Number(speed01) || 0));
    const recoilT = Math.max(0, Math.min(1, Math.abs(Number(recoil) || 0) * 4));

    const movementGap =
      cfg.RESTING_GAP_PX +
      movementT * ((isSprinting ? cfg.MAX_SPRINT_GAP_PX : cfg.MAX_MOVEMENT_GAP_PX) - cfg.RESTING_GAP_PX);
    const accuracyGap = spreadT * cfg.MAX_BLOOM_GAP_PX;
    const recoilGap = recoilT * cfg.RECOIL_BLOOM_PX;
    const firingGap = isFiring ? cfg.FIRE_BLOOM_PX : 0;

    const targetGap = isAiming && !isSprinting
      ? cfg.AIM_GAP_PX + accuracyGap * 0.9 + firingGap * 0.3 + recoilGap * 0.35
      : movementGap + accuracyGap + firingGap + recoilGap;

    const targetLength = isAiming && !isSprinting
      ? cfg.AIM_LENGTH_PX + spreadT * 2
      : cfg.RESTING_LENGTH_PX + movementT * (cfg.MAX_LENGTH_PX - cfg.RESTING_LENGTH_PX) + spreadT * 2.5;

    const targetOpacity = isAiming && !isSprinting ? cfg.ARMS_OPACITY : cfg.ARMS_OPACITY - spreadT * 0.08;
    const response = 1 - Math.exp(-cfg.RESPONSE / 60);

    this._crosshairGap += (targetGap - this._crosshairGap) * response;
    this._crosshairLength += (targetLength - this._crosshairLength) * response;
    this._crosshairOpacity += (targetOpacity - this._crosshairOpacity) * response;

    const center = 100;
    const gap = Math.max(0, this._crosshairGap);
    const length = Math.max(2, this._crosshairLength);
    const thickness = Math.max(0.5, cfg.RESTING_THICKNESS_PX);

    const accuracyColor = spreadT < 0.33
      ? cfg.ACCURACY_COLOR_GOOD
      : spreadT < 0.66 ? cfg.ACCURACY_COLOR_MID : cfg.ACCURACY_COLOR_BAD;
    const color = cfg.COLOR_MODE === 'accuracy' ? accuracyColor : cfg.COLOR;

    const setPartStyle = (part) => {
      if (!part) return;
      part.setAttribute('fill', color);
      part.setAttribute('stroke', cfg.OUTLINE_COLOR);
      part.setAttribute('stroke-width', String(cfg.OUTLINE_WIDTH));
      part.style.opacity = String(this._crosshairOpacity);
      part.style.display = cfg.ARMS_ENABLED ? '' : 'none';
    };

    const [top, right, bottom, left] = this.crosshairParts;
    if (top) {
      top.setAttribute('x', center - thickness);
      top.setAttribute('y', center - gap - length);
      top.setAttribute('width', thickness * 2);
      top.setAttribute('height', length);
      setPartStyle(top);
    }
    if (right) {
      right.setAttribute('x', center + gap);
      right.setAttribute('y', center - thickness);
      right.setAttribute('width', length);
      right.setAttribute('height', thickness * 2);
      setPartStyle(right);
    }
    if (bottom) {
      bottom.setAttribute('x', center - thickness);
      bottom.setAttribute('y', center + gap);
      bottom.setAttribute('width', thickness * 2);
      bottom.setAttribute('height', length);
      setPartStyle(bottom);
    }
    if (left) {
      left.setAttribute('x', center - gap - length);
      left.setAttribute('y', center - thickness);
      left.setAttribute('width', length);
      left.setAttribute('height', thickness * 2);
      setPartStyle(left);
    }

    if (this.crosshairDot) {
      this.crosshairDot.setAttribute('fill', color);
      this.crosshairDot.setAttribute('stroke', cfg.OUTLINE_COLOR);
      this.crosshairDot.setAttribute('stroke-width', String(cfg.OUTLINE_WIDTH));
      this.crosshairDot.setAttribute('r', String(isAiming && !isSprinting ? cfg.DOT_RADIUS_ADS_PX : cfg.DOT_RADIUS_PX));
      this.crosshairDot.style.opacity = cfg.DOT_ENABLED
        ? String(this._crosshairOpacity * cfg.DOT_OPACITY)
        : '0';
    }
  }

  setCrosshairStyle({
    color,
    outlineColor,
    colorMode,
    outlineWidth,
    armsEnabled,
    dotEnabled,
    dotRadius,
  } = {}) {
    if (color != null) this._crosshairStyle.COLOR = String(color);
    if (outlineColor != null) this._crosshairStyle.OUTLINE_COLOR = String(outlineColor);
    if (colorMode != null) this._crosshairStyle.COLOR_MODE = String(colorMode);
    if (outlineWidth != null) this._crosshairStyle.OUTLINE_WIDTH = Math.max(0, Number(outlineWidth) || 0);
    if (armsEnabled != null) this._crosshairStyle.ARMS_ENABLED = !!armsEnabled;
    if (dotEnabled != null) this._crosshairStyle.DOT_ENABLED = !!dotEnabled;
    if (dotRadius != null) {
      const radius = Math.max(0, Number(dotRadius) || 0);
      this._crosshairStyle.DOT_RADIUS_PX = radius;
      this._crosshairStyle.DOT_RADIUS_ADS_PX = radius * 0.74;
    }
    this.updateCrosshair();
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

  updateMultiplayerState(state = {}) {
    const players = Array.isArray(state.players) ? state.players : [];
    const online = players.filter((p) => p.status === 'online').length;
    if (this.playerCountEl) {
      this.playerCountEl.textContent = `${online}/${state.maxPlayers ?? players.length}`;
    }
    if (!this.playerListEl) return;

    this.playerListEl.replaceChildren();
    for (const player of players) {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:7px 11px;border-bottom:1px solid rgba(255,255,255,.045);font-size:11px;';

      const name = document.createElement('span');
      name.textContent = String(player.displayName || 'Player').slice(0, 16);
      name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;';
      if (player.status === 'left') name.style.opacity = '0.45';
      if (player.isHost) name.textContent += '  HOST';

      const kd = document.createElement('span');
      const kills = Number(player.kills) || 0;
      const deaths = Number(player.deaths) || 0;
      kd.textContent = `${kills}/${deaths}`;
      kd.style.cssText = 'font-variant-numeric:tabular-nums;color:#dfe4ea;';

      const net = document.createElement('span');
      const ping = Number.isFinite(player.pingMs) ? `${Math.max(0, Math.round(player.pingMs))}ms` : '—';
      const path = String(player.path || 'unknown');
      const pathLabel = path === 'lan-direct' ? 'LAN' : path === 'internet-direct' ? 'DIRECT' : path === 'relay' ? 'RELAY' : path === 'host' ? 'LOCAL' : '—';
      net.textContent = player.status === 'left' ? 'LEFT' : `${ping} · ${pathLabel}`;
      net.style.cssText = 'font-variant-numeric:tabular-nums;color:' + (
        player.status === 'left' ? '#7f8c8d' :
        Number(player.pingMs) < 70 ? '#7bed9f' :
        Number(player.pingMs) < 140 ? '#f6c85f' : '#ff6b81'
      ) + ';';

      row.append(name, kd, net);
      this.playerListEl.appendChild(row);
    }

    const onlinePlayers = players.filter((p) => p.status === 'online' && Number.isFinite(p.pingMs));
    const relayCount = onlinePlayers.filter((p) => p.path === 'relay').length;
    const avgPing = onlinePlayers.length
      ? Math.round(onlinePlayers.reduce((sum, p) => sum + p.pingMs, 0) / onlinePlayers.length)
      : null;
    if (this.networkSummaryEl) {
      this.networkSummaryEl.textContent = onlinePlayers.length
        ? `NETWORK · avg ${avgPing}ms · ${relayCount} relay · telemetry ${new Date(state.serverTime || Date.now()).toLocaleTimeString()}`
        : 'NETWORK · waiting for telemetry';
    }
  }

  setDeathOverlay(isDead) {
    this.deathOverlay.style.display = isDead ? 'block' : 'none';
  }

  dispose() {
    window.removeEventListener('keydown', this._scoreboardKeyHandler);
    this.container?.parentNode?.removeChild(this.container);
  }
}
