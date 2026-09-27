import { NETWORK_CONFIG, UI_CONFIG } from '../config/index.js';

// src/ui/LobbyUI.js

/**
 * LobbyUI
 * Handles room creation, joining sessions via WebRTC Peer ID, status feedback,
 * and user lobby interface controls prior to launching game sessions.
 */
export class LobbyUI {
  /**
   * @param {object} callbacks - Event callbacks for UI actions.
   * @param {Function} callbacks.onHostGame - Triggered when Host Game button is clicked.
   * @param {Function} callbacks.onJoinGame - Triggered when Join Game button is clicked with room ID.
   */
  constructor(callbacks = {}) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'lobby-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
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

  /**
   * Constructs Lobby DOM interface elements and binds events.
   * @private
   */
  _createDOMStructure() {
    this.container.innerHTML = `
      <div style="
        background: rgba(30, 39, 46, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        width: 380px;
        text-align: center;
        backdrop-filter: blur(10px);
      ">
        <h1 style="margin: 0 0 10px 0; font-size: 28px; letter-spacing: 2px; color: #00d2d3;">P2P FPS ARENA</h1>
        <p style="margin: 0 0 30px 0; font-size: 13px; color: #888;">Listen-Host WebRTC Network Architecture</p>
        <div id="host-invitation" style="display:none; margin:-10px 0 24px; padding:14px; border-radius:8px; background:rgba(16,172,132,0.12); border:1px solid rgba(16,172,132,0.35);">
          <div style="font-size:11px; color:#aaa; letter-spacing:1px; margin-bottom:6px;">INVITATION CODE</div>
          <div style="display:flex; justify-content:center; gap:8px;">
            <input id="host-code" readonly style="width:150px; padding:10px; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.15); border-radius:6px; color:white; font-size:24px; font-weight:800; letter-spacing:6px; text-align:center;">
            <button id="btn-copy-code" style="padding:10px 12px; border:0; border-radius:6px; cursor:pointer; font-weight:700;">Copy</button>
          </div>
        </div>

        <!-- Status Panel -->
        <div id="lobby-status" style="
          margin-bottom: 24px;
          padding: 10px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.3);
          font-size: 14px;
          color: #ffda79;
        ">Initializing Peer Network...</div>

        <!-- Action Controls -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <button id="btn-host" style="
            padding: 12px;
            background: #10ac84;
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
          ">Host New Game</button>

          <div style="display: flex; align-items: center; margin: 10px 0;">
            <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
            <span style="padding: 0 10px; font-size: 12px; color: #666;">OR JOIN ROOM</span>
            <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
          </div>

          <input id="input-room-id" type="text" maxlength="${NETWORK_CONFIG.INVITATION_CODE.LENGTH}" autocomplete="off" autocapitalize="characters" placeholder="Enter ${NETWORK_CONFIG.INVITATION_CODE.LENGTH}-character invitation code" style="
            padding: 12px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
            text-align: center;
            outline: none;
          "/>

          <button id="btn-join" style="
            padding: 12px;
            background: #2e86de;
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
          ">Join Game</button>
        </div>
      </div>
    `;

    // Append container to body BEFORE querying elements if not already appended
    if (!this.container.parentNode) {
      document.body.appendChild(this.container);
    }

    // Query directly from container instance to avoid global document timing mismatches
    this.statusEl = this.container.querySelector('#lobby-status');
    this.hostBtn = this.container.querySelector('#btn-host');
    this.joinBtn = this.container.querySelector('#btn-join');
    this.roomIdInput = this.container.querySelector('#input-room-id');
    this.invitationPanel = this.container.querySelector('#host-invitation');
    this.hostCodeInput = this.container.querySelector('#host-code');
    this.copyCodeBtn = this.container.querySelector('#btn-copy-code');

    // Guarded Event Attachments
    if (this.hostBtn) {
      this.hostBtn.addEventListener('click', () => {
        if (this.callbacks?.onHostGame) this.callbacks.onHostGame();
      });
    }

    if (this.joinBtn) {
      this.joinBtn.addEventListener('click', () => {
        const roomId = this.roomIdInput?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
        if (roomId && this.callbacks?.onJoinGame) {
          this.callbacks.onJoinGame(roomId);
        }
      });
    }

    if (this.copyCodeBtn) {
      this.copyCodeBtn.addEventListener('click', async () => {
        const code = this.hostCodeInput?.value || '';
        try {
          await navigator.clipboard.writeText(code);
          this.copyCodeBtn.textContent = 'Copied!';
          setTimeout(() => { this.copyCodeBtn.textContent = 'Copy'; }, UI_CONFIG.COPY_FEEDBACK_DURATION_MS);
        } catch {
          this.hostCodeInput?.select();
          document.execCommand('copy');
        }
      });
    }
  }

  showInvitationCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (normalized.length !== NETWORK_CONFIG.INVITATION_CODE.LENGTH) return;
    if (this.hostCodeInput) this.hostCodeInput.value = normalized;
    if (this.invitationPanel) this.invitationPanel.style.display = 'block';
  }

  /**
   * Updates status text and text color in the lobby container.
   * @param {string} message 
   * @param {string} color 
   */
  setStatus(message, color = '#ffda79') {
    this.statusEl.textContent = message;
    this.statusEl.style.color = color;
  }

  /**
   * Shows or hides the Lobby interface.
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Cleans up lobby DOM elements.
   */
  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}