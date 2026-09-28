// src/index.js

import { HostGame } from './HostGame.js';
import { ClientGame } from './ClientGame.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { NETWORK_CONFIG, UI_CONFIG, setSavedPerformanceProfile } from './config/index.js';

/**
 * Application Entry Point
 * Initializes the lobby user interface and routes game execution between
 * Authoritative Host Server or P2P Client modes.
 */
class App {
  constructor() {
    this.gameInstance = null;
    this.lobbyUI = null;
  }

  /**
   * Bootstraps application state and renders lobby interface.
   */
  init() {
    this.lobbyUI = new LobbyUI({
      onHostGame: (profile) => this.startHostSession(profile),
      onJoinGame: (roomId, profile) => this.startClientSession(roomId, profile),
    });

    this.lobbyUI.setStatus('Ready to Host or Join game.', UI_CONFIG.STATUS.READY);
  }

  /**
   * Instantiates and runs an Authoritative Host game session.
   */
  async startHostSession(profile = null) {
    if (profile) setSavedPerformanceProfile(profile);
    try {
      this.lobbyUI.setStatus('Initializing Host Session...', UI_CONFIG.STATUS.READY);

      const hostGame = new HostGame(document.body);
      this.gameInstance = hostGame;

      const hostRoomId = await hostGame.initialize();

      this.lobbyUI.showInvitationCode(hostRoomId);
      this.lobbyUI.setStatus('Host Active! Share the 5-character invitation code.', UI_CONFIG.STATUS.SUCCESS);
      
      // Delay lobby hide to allow host user to view and copy their Room ID
      setTimeout(() => {
        this.lobbyUI.setVisible(false);
        hostGame.start();
      }, 3000);
    } catch (err) {
      this.lobbyUI?.setBusy(false);
      console.error('Failed to initialize Host session:', err);
      this.lobbyUI.setStatus(`Host Error: ${err.message}`, UI_CONFIG.STATUS.ERROR);
    }
  }

  /**
   * Instantiates and connects a Client game session to a remote host room ID.
   * 
   * @param {string} roomId - Host WebRTC Peer ID.
   */
  async startClientSession(roomId, profile = null) {
    if (profile) setSavedPerformanceProfile(profile);
    try {
      const invitationCode = String(roomId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (invitationCode.length !== NETWORK_CONFIG.INVITATION_CODE.LENGTH) {
        this.lobbyUI.setBusy(false);
        this.lobbyUI.setStatus(`Invitation code must be exactly ${NETWORK_CONFIG.INVITATION_CODE.LENGTH} characters.`, UI_CONFIG.STATUS.ERROR);
        return;
      }
      this.lobbyUI.setStatus(`Connecting to Host [${invitationCode}]...`, UI_CONFIG.STATUS.READY);

      const clientGame = new ClientGame(document.body);
      this.gameInstance = clientGame;

      await clientGame.initialize(invitationCode);

      this.lobbyUI.setStatus('Connected! Starting session...', UI_CONFIG.STATUS.SUCCESS);
      this.lobbyUI.setVisible(false);

      clientGame.start();
    } catch (err) {
      this.lobbyUI?.setBusy(false);
      console.error('Failed to connect Client session:', err);
      this.lobbyUI.setStatus(`Connection Error: ${err.message}`, UI_CONFIG.STATUS.ERROR);
    }
  }
}

// Launch application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});