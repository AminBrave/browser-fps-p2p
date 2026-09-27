import { NETWORK_CONFIG } from '../config/index.js';
import { Peer } from 'peerjs';

/**
 * Owns the PeerJS/WebRTC lifecycle.
 *
 * Invariants:
 * - a peer connection is registered once;
 * - close/error handling is idempotent;
 * - destroy closes transports and clears callbacks;
 * - supported typed-array payloads are normalized to ArrayBuffer.
 */
export class PeerManager {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.isHost = false;
    this.hostPeerId = null;
    this.invitationCode = null;

    this.onDataCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;

    this.destroyed = false;
  }

  initHost(customRoomId = null) {
    this._resetForInitialization();
    this.isHost = true;

    return new Promise((resolve, reject) => {
      let settled = false;
      let attempt = 0;
      const requestedRoomId = String(customRoomId || '').trim();

      const fail = (error) => {
        if (!settled) {
          settled = true;
          reject(this._toConnectionError(error));
        }
      };

      const createPeer = () => {
        if (settled || this.destroyed) {
          fail(new Error('Peer manager was destroyed'));
          return;
        }

        attempt += 1;
        const invitationCode =
          requestedRoomId || PeerManager.createInvitationCode();
        this.invitationCode = invitationCode;

        const peer = new Peer(invitationCode, this._getPeerOptions());
        this.peer = peer;

        peer.on('open', (id) => {
          if (this.destroyed || this.peer !== peer) return;
          this._setupHostListeners();
          settled = true;
          resolve(id);
        });

        peer.on('error', (error) => {
          if (this.destroyed || this.peer !== peer || settled) return;
          const isCollision = error?.type === 'unavailable-id';
          const canRetry = !requestedRoomId && isCollision && attempt < NETWORK_CONFIG.INVITATION_CODE.MAX_RETRIES;
          if (!canRetry) {
            fail(error);
            return;
          }

          try { peer.destroy(); } catch {}
          if (this.peer === peer) this.peer = null;
          createPeer();
        });
      };

      createPeer();
    });
  }

  static createInvitationCode() {
    const { ALPHABET, LENGTH } = NETWORK_CONFIG.INVITATION_CODE;
    const values = new Uint32Array(LENGTH);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join('');
  }

  _getPeerOptions() {
    return {
      secure: true,
      debug: 1,
      config: {
        iceServers: NETWORK_CONFIG.WEBRTC.ICE_SERVERS,
        sdpSemantics: NETWORK_CONFIG.WEBRTC.SDP_SEMANTICS,
      },
    };
  }

  _toConnectionError(error) {
    if (error instanceof Error && error.message) return error;
    const type = String(error?.type || error?.name || 'network');
    const detail = String(error?.message || error?.description || '').trim();
    return new Error('Peer connection failed: ' + type + (detail ? ' (' + detail + ')' : ''));
  }

  initializeHost(customRoomId = null) {
    return this.initHost(customRoomId);
  }

  initClient(hostPeerId) {
    this._resetForInitialization();
    this.isHost = false;
    this.hostPeerId = String(hostPeerId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!this.hostPeerId) {
      return Promise.reject(new Error('Host room ID is required'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(this._getPeerOptions());
      this.peer = peer;

      const fail = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      peer.on('open', (localId) => {
        if (this.destroyed) return fail(new Error('Peer manager was destroyed'));

        const conn = peer.connect(this.hostPeerId, {
          // Use an ordered/reliable channel for simulation inputs and world initialization.
          // The game uses sequence numbers, so dropping input frames would make
          // client prediction impossible to reconcile with the authoritative host.
          // ArrayBuffer payloads use PeerJS's supported binary serializer.
          reliable: true,
          serialization: 'binary',
        });

        const timeoutId = setTimeout(() => {
          if (!settled) {
            try { conn.close(); } catch {}
            fail(new Error('Timed out while establishing the WebRTC connection'));
          }
        }, NETWORK_CONFIG.WEBRTC.CONNECTION_TIMEOUT_MS);

        conn.on('open', () => {
          clearTimeout(timeoutId);
          this._registerConnection(conn);
          if (!settled) {
            settled = true;
            resolve(localId);
          }
        });
        conn.on('error', (error) => {
          clearTimeout(timeoutId);
          fail(error);
        });
      });

      peer.on('error', fail);
    });
  }

  initializeClient(hostPeerId) {
    return this.initClient(hostPeerId);
  }

  _resetForInitialization() {
    this.destroyed = false;
    this._closeConnections();
    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
    }
    this.peer = null;
  }

  _setupHostListeners() {
    this.peer?.on('connection', (conn) => this._registerConnection(conn));
  }

  _registerConnection(conn) {
    if (!conn?.peer || this.destroyed) {
      try { conn?.close(); } catch {}
      return;
    }

    const peerId = String(conn.peer);
    const previous = this.connections.get(peerId);
    if (previous && previous !== conn) {
      try { previous.close(); } catch {}
    }

    this.connections.set(peerId, conn);
    let announced = false;
    const announceConnected = () => {
      if (announced || this.destroyed) return;
      announced = true;
      this.onConnectCallback?.(peerId);
    };

    conn.on('open', announceConnected);
    if (conn.open) announceConnected();

    conn.on('data', (data) => {
      const buffer = this._toArrayBuffer(data);
      if (!buffer || buffer.byteLength === 0) return;
      this.onDataCallback?.(peerId, new DataView(buffer));
    });

    const onEnd = () => this._removeConnection(peerId, conn);
    conn.on('close', onEnd);
    conn.on('error', onEnd);
  }

  _removeConnection(peerId, conn) {
    if (this.connections.get(peerId) !== conn) return;

    this.connections.delete(peerId);
    try { conn.close(); } catch {}
    this.onDisconnectCallback?.(peerId);
  }

  _toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      return data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      );
    }
    return null;
  }

  sendTo(peerId, buffer) {
    const id = String(peerId);
    const conn = this.connections.get(id);
    if (!conn?.open || !buffer) return false;

    try {
      conn.send(buffer);
      return true;
    } catch {
      this._removeConnection(id, conn);
      return false;
    }
  }

  sendToHost(buffer) {
    if (this.isHost || !this.hostPeerId) return false;
    return this.sendTo(this.hostPeerId, buffer);
  }

  broadcast(buffer) {
    if (!buffer) return;
    for (const [peerId, conn] of this.connections) {
      if (!conn?.open) continue;
      try {
        conn.send(buffer);
      } catch {
        this._removeConnection(peerId, conn);
      }
    }
  }

  onData(cb) { this.onDataCallback = cb; }
  onConnect(cb) { this.onConnectCallback = cb; }
  onPeerConnect(cb) { this.onConnect(cb); }
  onDisconnect(cb) { this.onDisconnectCallback = cb; }
  onPeerDisconnect(cb) { this.onDisconnect(cb); }

  _closeConnections() {
    for (const conn of this.connections.values()) {
      try { conn.close(); } catch {}
    }
    this.connections.clear();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this._closeConnections();
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }

    this.hostPeerId = null;
    this.invitationCode = null;
    this.onDataCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
  }
}
