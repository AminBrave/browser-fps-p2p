// src/index.js

import { HostGame } from './HostGame.js';
import { ClientGame } from './ClientGame.js';
import { LobbyUI } from './ui/LobbyUI.js';

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
      onHostGame: () => this.startHostSession(),
      onJoinGame: (roomId) => this.startClientSession(roomId),
    });

    this.lobbyUI.setStatus('Ready to Host or Join game.');
  }

  /**
   * Instantiates and runs an Authoritative Host game session.
   */
  async startHostSession() {
    try {
      this.lobbyUI.setStatus('Initializing Host Session...', '#ffda79');

      const hostGame = new HostGame(document.body);
      this.gameInstance = hostGame;

      const hostRoomId = await hostGame.initialize();

      this.lobbyUI.setStatus(`Host Active! Room ID: ${hostRoomId} (Share with clients)`, '#10ac84');
      
      // Delay lobby hide to allow host user to view and copy their Room ID
      setTimeout(() => {
        this.lobbyUI.setVisible(false);
        hostGame.start();
      }, 3000);
    } catch (err) {
      console.error('Failed to initialize Host session:', err);
      this.lobbyUI.setStatus(`Host Error: ${err.message}`, '#ff4757');
    }
  }

  /**
   * Instantiates and connects a Client game session to a remote host room ID.
   * 
   * @param {string} roomId - Host WebRTC Peer ID.
   */
  async startClientSession(roomId) {
    try {
      this.lobbyUI.setStatus(`Connecting to Host [${roomId}]...`, '#ffda79');

      const clientGame = new ClientGame(document.body);
      this.gameInstance = clientGame;

      await clientGame.initialize(roomId);

      this.lobbyUI.setStatus('Connected! Starting session...', '#10ac84');
      this.lobbyUI.setVisible(false);

      clientGame.start();
    } catch (err) {
      console.error('Failed to connect Client session:', err);
      this.lobbyUI.setStatus(`Connection Error: ${err.message}`, '#ff4757');
    }
  }
}

// Launch application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});