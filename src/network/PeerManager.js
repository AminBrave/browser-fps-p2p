// src/network/PeerManager.js

import { Peer } from 'peerjs';

/**
 * PeerManager wraps PeerJS to handle WebRTC DataChannel connections,
 * room creation, signaling, and raw binary network I/O between Host and Clients.
 */
export class PeerManager {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // Map<peerId, DataConnection>
    this.isHost = false;
    this.hostPeerId = null; // set on client so sendToHost works
    this.onDataCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
  }

  /**
   * Initializes the Host peer instance and sets up connection listeners.
   * @param {string} [customRoomId]
   * @returns {Promise<string>} Generated or assigned Room Peer ID.
   */
  initHost(customRoomId = null) {
    this.isHost = true;
    return new Promise((resolve, reject) => {
      this.peer = customRoomId ? new Peer(customRoomId) : new Peer();

      this.peer.on('open', (id) => {
        this._setupHostListeners();
        resolve(id);
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  initializeHost(customRoomId = null) {
    return this.initHost(customRoomId);
  }

  /**
   * Initializes a Client peer and connects to a Host room ID.
   * Resolves with the local PeerJS id (used as localPlayerId).
   * @param {string} hostPeerId
   * @returns {Promise<string>} Local peer id
   */
  initClient(hostPeerId) {
    this.isHost = false;
    this.hostPeerId = hostPeerId;
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', (localId) => {
        const conn = this.peer.connect(hostPeerId, {
          reliable: false,
          serialization: 'none',
        });

        conn.on('open', () => {
          this.connections.set(hostPeerId, conn);
          this._setupConnectionListeners(conn, hostPeerId);
          if (this.onConnectCallback) this.onConnectCallback(hostPeerId);
          resolve(localId);
        });

        conn.on('error', (err) => {
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  initializeClient(hostPeerId) {
    return this.initClient(hostPeerId);
  }

  _setupHostListeners() {
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.connections.set(conn.peer, conn);
        this._setupConnectionListeners(conn, conn.peer);
        if (this.onConnectCallback) this.onConnectCallback(conn.peer);
      });
    });
  }

  _setupConnectionListeners(conn, peerId) {
    conn.on('data', (data) => {
      if (this.onDataCallback && data instanceof ArrayBuffer) {
        this.onDataCallback(peerId, new DataView(data));
      }
    });

    conn.on('close', () => {
      this.connections.delete(peerId);
      if (this.onDisconnectCallback) this.onDisconnectCallback(peerId);
    });

    conn.on('error', () => {
      this.connections.delete(peerId);
      if (this.onDisconnectCallback) this.onDisconnectCallback(peerId);
    });
  }

  sendTo(peerId, buffer) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(buffer);
    }
  }

  /**
   * Client → Host: send binary payload to the connected host peer.
   * @param {ArrayBuffer} buffer
   */
  sendToHost(buffer) {
    if (this.isHost) return;
    if (this.hostPeerId) {
      this.sendTo(this.hostPeerId, buffer);
      return;
    }
    // Fallback: first (and usually only) connection
    for (const [, conn] of this.connections) {
      if (conn.open) {
        conn.send(buffer);
        break;
      }
    }
  }

  broadcast(buffer) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(buffer);
      }
    });
  }

  /**
   * @param {function(peerId: string, view: DataView): void} cb
   */
  onData(cb) {
    this.onDataCallback = cb;
  }

  onConnect(cb) {
    this.onConnectCallback = cb;
  }

  onPeerConnect(cb) {
    this.onConnect(cb);
  }

  onDisconnect(cb) {
    this.onDisconnectCallback = cb;
  }

  onPeerDisconnect(cb) {
    this.onDisconnect(cb);
  }

  destroy() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
    }
  }
}
