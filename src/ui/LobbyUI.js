import { NETWORK_CONFIG, UI_CONFIG, PERFORMANCE_PROFILES, getSavedPerformanceProfile, resolvePerformanceProfile, setSavedPerformanceProfile } from '../config/index.js';

/**
 * Pre-game lobby and local graphics/performance selection.
 * Performance settings are presentation-only and are intentionally never
 * included in network messages.
 */
export class LobbyUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.busy = false;

    this.container = document.createElement('div');
    this.container.id = 'lobby-overlay';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at center, #1e272e 0%, #0f171e 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #ffffff;
      z-index: 999;
    `;

    this._createDOMStructure();
    document.body.appendChild(this.container);
  }

  _createDOMStructure() {
    const savedProfile = getSavedPerformanceProfile();
    const profileOptions = [
      '<option value="auto">Auto — recommended</option>',
      ...Object.values(PERFORMANCE_PROFILES).map((profile) =>
        `<option value="${profile.id}">${profile.label}</option>`
      ),
    ].join('');

    this.container.innerHTML = `
      <div style="
        background: rgba(30, 39, 46, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 36px;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        width: min(380px, calc(100vw - 40px));
        text-align: center;
        backdrop-filter: blur(10px);
      ">
        <h1 style="margin:0 0 10px;font-size:28px;letter-spacing:2px;color:#00d2d3;">P2P FPS ARENA</h1>
        <p style="margin:0 0 24px;font-size:13px;color:#888;">Listen-Host WebRTC Network Architecture</p>

        <div style="margin-bottom:22px;text-align:left;padding:14px;border-radius:8px;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.08);">
          <label for="graphics-profile" style="display:block;font-size:11px;color:#aaa;letter-spacing:1px;margin-bottom:8px;">GRAPHICS / PERFORMANCE</label>
          <select id="graphics-profile" style="width:100%;padding:10px;background:#182128;color:white;border:1px solid rgba(255,255,255,.18);border-radius:6px;font-size:14px;">
            ${profileOptions}
          </select>
          <div id="graphics-profile-help" style="margin-top:8px;font-size:11px;line-height:1.45;color:#777;"></div>
        </div>

        <div id="host-invitation" style="display:none;margin:-4px 0 22px;padding:14px;border-radius:8px;background:rgba(16,172,132,.12);border:1px solid rgba(16,172,132,.35);">
          <div style="font-size:11px;color:#aaa;letter-spacing:1px;margin-bottom:6px;">INVITATION CODE</div>
          <div style="display:flex;justify-content:center;gap:8px;">
            <input id="host-code" readonly style="width:150px;padding:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:white;font-size:24px;font-weight:800;letter-spacing:6px;text-align:center;">
            <button id="btn-copy-code" style="padding:10px 12px;border:0;border-radius:6px;cursor:pointer;font-weight:700;">Copy</button>
          </div>
        </div>

        <div id="lobby-status" style="margin-bottom:24px;padding:10px;border-radius:6px;background:rgba(0,0,0,.3);font-size:14px;color:#ffda79;">Initializing Peer Network...</div>

        <div style="display:flex;flex-direction:column;gap:16px;">
          <button id="btn-host" style="padding:12px;background:#10ac84;border:none;border-radius:6px;color:white;font-size:16px;font-weight:bold;cursor:pointer;">Host New Game</button>
          <div style="display:flex;align-items:center;margin:2px 0;"><div style="flex:1;height:1px;background:rgba(255,255,255,.1);"></div><span style="padding:0 10px;font-size:12px;color:#666;">OR JOIN ROOM</span><div style="flex:1;height:1px;background:rgba(255,255,255,.1);"></div></div>
          <input id="input-room-id" type="text" maxlength="${NETWORK_CONFIG.INVITATION_CODE.LENGTH}" autocomplete="off" autocapitalize="characters" placeholder="Enter ${NETWORK_CONFIG.INVITATION_CODE.LENGTH}-character invitation code" style="padding:12px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.2);border-radius:6px;color:white;font-size:14px;text-align:center;outline:none;">
          <button id="btn-join" style="padding:12px;background:#2e86de;border:none;border-radius:6px;color:white;font-size:16px;font-weight:bold;cursor:pointer;">Join Game</button>
        </div>
      </div>
    `;

    this.statusEl = this.container.querySelector('#lobby-status');
    this.hostBtn = this.container.querySelector('#btn-host');
    this.joinBtn = this.container.querySelector('#btn-join');
    this.roomIdInput = this.container.querySelector('#input-room-id');
    this.invitationPanel = this.container.querySelector('#host-invitation');
    this.hostCodeInput = this.container.querySelector('#host-code');
    this.copyCodeBtn = this.container.querySelector('#btn-copy-code');
    this.graphicsProfile = this.container.querySelector('#graphics-profile');
    this.graphicsProfileHelp = this.container.querySelector('#graphics-profile-help');
    this.graphicsProfile.value = savedProfile;
    this._updateProfileHelp();

    this.graphicsProfile.addEventListener('change', () => {
      setSavedPerformanceProfile(this.graphicsProfile.value);
      this._updateProfileHelp();
    });

    this.hostBtn.addEventListener('click', () => {
      if (this.busy) return;
      this.setBusy(true);
      this.callbacks?.onHostGame?.(this.getPerformanceProfile());
    });

    this.joinBtn.addEventListener('click', () => {
      if (this.busy) return;
      const roomId = this.roomIdInput?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
      if (!roomId) return;
      this.setBusy(true);
      this.callbacks?.onJoinGame?.(roomId, this.getPerformanceProfile());
    });

    this.roomIdInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.joinBtn.click();
    });

    this.copyCodeBtn.addEventListener('click', async () => {
      const code = this.hostCodeInput?.value || '';
      try {
        await navigator.clipboard.writeText(code);
        this.copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => { if (this.copyCodeBtn) this.copyCodeBtn.textContent = 'Copy'; }, UI_CONFIG.COPY_FEEDBACK_DURATION_MS);
      } catch {
        this.hostCodeInput?.select();
        document.execCommand('copy');
      }
    });
  }

  getPerformanceProfile() {
    return this.graphicsProfile?.value || getSavedPerformanceProfile();
  }

  _updateProfileHelp() {
    const id = this.graphicsProfile?.value || 'auto';
    const profile = id === 'auto' ? resolvePerformanceProfile('auto') : PERFORMANCE_PROFILES[id];
    if (this.graphicsProfileHelp) {
      this.graphicsProfileHelp.textContent = id === 'auto'
        ? `Auto selects ${profile.label} for this device. Current target: ${profile.description}`
        : profile.description;
    }
  }

  setBusy(busy) {
    this.busy = !!busy;
    if (this.hostBtn) this.hostBtn.disabled = busy;
    if (this.joinBtn) this.joinBtn.disabled = busy;
    if (this.graphicsProfile) this.graphicsProfile.disabled = busy;
  }

  showInvitationCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (normalized.length !== NETWORK_CONFIG.INVITATION_CODE.LENGTH) return;
    if (this.hostCodeInput) this.hostCodeInput.value = normalized;
    if (this.invitationPanel) this.invitationPanel.style.display = 'block';
  }

  setStatus(message, color = '#ffda79') {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.style.color = color;
  }

  setVisible(visible) {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  dispose() {
    if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
  }
}
