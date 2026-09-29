import { Peer } from 'peerjs';
import { NETWORK_CONFIG, PROTOCOL_CONFIG, normalizeNetworkConnectionMode } from '../config/index.js';
import { resolveIceServers } from './IceServers.js';

const STATE = Object.freeze({
  IDLE: 'idle',
  SIGNALING: 'signaling',
  READY: 'ready',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  CLOSED: 'closed',
});

export class PeerManager {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.isHost = false;
    this.hostPeerId = null;
    this.invitationCode = null;
    this.state = STATE.IDLE;
    this.iceInfo = null;
    this.networkMode = NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE;
    this.onDataCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
    this.onStateCallback = null;
    this.onErrorCallback = null;
    this.destroyed = false;
  }

  async initHost(customRoomId = null, networkMode = NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE) {
    this._resetForInitialization();
    this.isHost = true;
    this.networkMode = normalizeNetworkConnectionMode(networkMode);
    this._setState(STATE.SIGNALING);

    const requestedRoomId = String(customRoomId || '').trim();
    this.iceInfo = await resolveIceServers(this.networkMode);

    for (let attempt = 1; attempt <= NETWORK_CONFIG.INVITATION_CODE.MAX_RETRIES; attempt++) {
      if (this.destroyed) throw new Error('Peer manager was destroyed');

      const invitationCode = requestedRoomId || PeerManager.createInvitationCode();

      try {
        const peer = await this._openPeer(invitationCode);
        this.peer = peer;
        this.invitationCode = invitationCode;
        this._setupHostListeners();
        this._setState(STATE.READY);
        return peer.id;
      } catch (error) {
        if (
          requestedRoomId ||
          error?.type !== 'unavailable-id' ||
          attempt >= NETWORK_CONFIG.INVITATION_CODE.MAX_RETRIES
        ) {
          this.destroy();
          throw this._toConnectionError(error);
        }
      }
    }

    throw new Error('Unable to allocate a unique invitation code');
  }

  initializeHost(customRoomId = null, networkMode = NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE) {
    return this.initHost(customRoomId, networkMode);
  }

  async initClient(hostPeerId, networkMode = NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE) {
    this._resetForInitialization();
    this.isHost = false;
    this.networkMode = normalizeNetworkConnectionMode(networkMode);
    this.hostPeerId = PeerManager.normalizePeerId(hostPeerId);

    if (!this.hostPeerId) throw new Error('Host invitation code is required');

    this._setState(STATE.SIGNALING);
    this.iceInfo = await resolveIceServers(this.networkMode);

    let peer = null;
    let connection = null;
    let timer = null;

    try {
      peer = await this._openPeer(null);
      this.peer = peer;
      this._setState(STATE.READY);
      this._setState(STATE.CONNECTING);

      connection = peer.connect(this.hostPeerId, {
        label: NETWORK_CONFIG.TRANSPORT.LABEL,
        reliable: NETWORK_CONFIG.TRANSPORT.RELIABLE,
        serialization: NETWORK_CONFIG.TRANSPORT.SERIALIZATION,
        metadata: {
          protocolVersion: PROTOCOL_CONFIG.PROTOCOL_VERSION,
          client: 'browser-fps',
        },
      });

      await new Promise((resolve, reject) => {
        let settled = false;

        const finish = (error = null) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          error ? reject(error) : resolve();
        };

        timer = setTimeout(async () => {
          const diagnostics = await this._collectConnectionDiagnostics(connection);
          finish(new Error(
            'Timed out after ' +
            NETWORK_CONFIG.WEBRTC.DATA_CONNECTION_TIMEOUT_MS +
            'ms while establishing WebRTC data connection to ' +
            this.hostPeerId + '. ' + diagnostics
          ));
        }, NETWORK_CONFIG.WEBRTC.DATA_CONNECTION_TIMEOUT_MS);

        connection.on('open', () => finish());
        connection.on('error', (error) => finish(error));
        connection.on('close', () => {
          if (!settled) finish(new Error('WebRTC data channel closed before opening'));
        });
      });

      this._registerConnection(connection);
      this._setState(STATE.CONNECTED);
      return peer.id;
    } catch (error) {
      try { connection?.close(); } catch {}
      try { peer?.destroy(); } catch {}
      this.peer = null;
      this._setState(STATE.CLOSED);
      throw this._toConnectionError(error);
    }
  }

  initializeClient(hostPeerId, networkMode = NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE) {
    return this.initClient(hostPeerId, networkMode);
  }

  static normalizePeerId(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  }

  static createInvitationCode() {
    const { ALPHABET, LENGTH } = NETWORK_CONFIG.INVITATION_CODE;
    const values = new Uint32Array(LENGTH);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join('');
  }

  _getPeerOptions(iceServers) {
    const options = {
      secure: NETWORK_CONFIG.SIGNALING.SECURE,
      debug: NETWORK_CONFIG.SIGNALING.DEBUG,
      pingInterval: NETWORK_CONFIG.SIGNALING.PING_INTERVAL_MS,
      config: {
        iceServers,
        iceTransportPolicy: this._getIceTransportPolicy(),
        sdpSemantics: NETWORK_CONFIG.WEBRTC.SDP_SEMANTICS,
      },
    };

    const host = String(import.meta.env.VITE_PEER_SERVER_HOST || '').trim();
    const port = Number(import.meta.env.VITE_PEER_SERVER_PORT || NETWORK_CONFIG.SIGNALING.PORT);
    const path = String(import.meta.env.VITE_PEER_SERVER_PATH || NETWORK_CONFIG.SIGNALING.PATH).trim();

    if (host) {
      options.host = host;
      options.port = Number.isFinite(port) ? port : 443;
      options.path = path || '/';
    }

    return options;
  }

  _getIceTransportPolicy() {
    if (this.networkMode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.DIRECT) return 'all';
    if (this.networkMode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.RELAY || this.networkMode === NETWORK_CONFIG.WEBRTC.CONNECTION_MODES.RELAY_TCP_TLS) return 'relay';
    return NETWORK_CONFIG.WEBRTC.ICE_TRANSPORT_POLICY;
  }

  async _openPeer(id) {
    const options = this._getPeerOptions(
      this.iceInfo?.iceServers || NETWORK_CONFIG.WEBRTC.STUN_SERVERS
    );
    const peer = id ? new Peer(id, options) : new Peer(options);

    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        finish(new Error(
          'Signaling server did not become ready within ' +
          NETWORK_CONFIG.WEBRTC.SIGNALING_TIMEOUT_MS + 'ms'
        ));
      }, NETWORK_CONFIG.WEBRTC.SIGNALING_TIMEOUT_MS);

      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          try { peer.destroy(); } catch {}
          reject(error);
        } else {
          resolve(peer);
        }
      };

      peer.on('open', () => finish());
      peer.on('error', (error) => finish(error));
      peer.on('disconnected', () => {
        if (!settled || this.destroyed) return;
        this._setState(STATE.SIGNALING);
      });
    });
  }

  _setupHostListeners() {
    this.peer?.on('connection', (connection) => this._registerConnection(connection));
  }

  _registerConnection(connection) {
    if (!connection?.peer || this.destroyed) {
      try { connection?.close(); } catch {}
      return;
    }

    const peerId = String(connection.peer);
    const previous = this.connections.get(peerId);
    if (previous && previous !== connection) this._closeConnection(peerId, previous);

    this.connections.set(peerId, connection);

    let announced = false;
    const announceConnected = () => {
      if (announced || this.destroyed) return;
      announced = true;
      this._setState(this.isHost ? STATE.READY : STATE.CONNECTED);
      this.onConnectCallback?.(peerId, connection);
      this._attachConnectionDiagnostics(connection);
    };

    connection.on('open', announceConnected);
    connection.on('data', (data) => {
      const buffer = this._toArrayBuffer(data);
      if (!buffer || buffer.byteLength === 0) return;

      if (buffer.byteLength > NETWORK_CONFIG.TRANSPORT.MAX_PACKET_BYTES) {
        console.warn('[Network] Dropping oversized packet', {
          peerId,
          bytes: buffer.byteLength,
        });
        return;
      }

      this.onDataCallback?.(peerId, new DataView(buffer));
    });

    const onEnd = () => this._removeConnection(peerId, connection);
    connection.on('close', onEnd);
    connection.on('error', (error) => {
      console.warn('[Network] Data connection error', peerId, error);
      this.onErrorCallback?.(error, peerId);
      onEnd();
    });

    if (connection.open) announceConnected();
  }

  _attachConnectionDiagnostics(connection) {
    const pc = connection?.peerConnection;
    if (!pc || pc.__fpsDiagnosticsAttached) return;

    pc.__fpsDiagnosticsAttached = true;

    const report = () => {
      console.info('[WebRTC]', {
        peer: connection.peer,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
      });
    };

    pc.addEventListener?.('connectionstatechange', report);
    pc.addEventListener?.('iceconnectionstatechange', report);
    pc.addEventListener?.('icegatheringstatechange', report);
    pc.addEventListener?.('icecandidateerror', (event) => {
      console.warn('[WebRTC] ICE candidate error', {
        peer: connection.peer,
        url: event.url,
        errorCode: event.errorCode,
        errorText: event.errorText,
      });
    });

    setTimeout(
      () => this._logSelectedCandidatePair(connection),
      NETWORK_CONFIG.WEBRTC.STATS_SAMPLE_DELAY_MS
    );
  }

  async _logSelectedCandidatePair(connection) {
    const pc = connection?.peerConnection;
    if (!pc?.getStats) return;

    try {
      const stats = await pc.getStats();
      let selectedPair = null;

      stats.forEach((report) => {
        if (
          report.type === 'transport' &&
          report.selectedCandidatePairId
        ) {
          selectedPair = stats.get(report.selectedCandidatePairId);
        }
      });

      if (!selectedPair) {
        stats.forEach((report) => {
          if (
            report.type === 'candidate-pair' &&
            (report.selected || report.nominated)
          ) {
            selectedPair = report;
          }
        });
      }

      const localCandidate = selectedPair
        ? stats.get(selectedPair.localCandidateId)
        : null;
      const remoteCandidate = selectedPair
        ? stats.get(selectedPair.remoteCandidateId)
        : null;

      console.info('[WebRTC] Candidate path', {
        peer: connection.peer,
        state: pc.connectionState,
        localType: localCandidate?.candidateType || 'unknown',
        remoteType: remoteCandidate?.candidateType || 'unknown',
        protocol: selectedPair?.protocol || 'unknown',
        rttMs: selectedPair?.currentRoundTripTime
          ? Math.round(selectedPair.currentRoundTripTime * 1000)
          : null,
      });
    } catch (error) {
      console.debug('[WebRTC] Stats unavailable', error);
    }
  }

  async _collectConnectionDiagnostics(connection) {
    const pc = connection?.peerConnection;
    if (!pc) return 'No RTCPeerConnection diagnostics were exposed.';

    const parts = [
      'ice=' + (pc.iceConnectionState || 'unknown'),
      'connection=' + (pc.connectionState || 'unknown'),
      'gathering=' + (pc.iceGatheringState || 'unknown'),
      'TURN=' + (this.iceInfo?.hasTurn ? 'available' : 'unavailable'),
    ];

    return '(' + parts.join(', ') + ')';
  }

  _toConnectionError(error) {
    if (error instanceof Error && error.message) return error;

    const type = String(error?.type || error?.name || 'network');
    const detail = String(
      error?.message ||
      error?.description ||
      error?.error?.message ||
      ''
    ).trim();

    const messages = {
      'peer-unavailable': 'The host invitation code is not currently online.',
      network: 'The signaling server could not be reached.',
      'server-error': 'The signaling server rejected the request.',
      'socket-error': 'The signaling WebSocket failed.',
      'ssl-unavailable': 'Secure signaling is unavailable on the configured PeerServer.',
      webrtc: 'WebRTC ICE negotiation failed. A working TURN relay is required for some Internet/NAT combinations.',
      'browser-incompatible': 'This browser does not support the required WebRTC data channel features.',
      'unavailable-id': 'The invitation code is already in use.',
    };

    const base = messages[type] || 'Peer connection failed.';
    return new Error(
      base + ' [' + type + ']' + (detail ? ' ' + detail : '')
    );
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onStateCallback?.(state);
  }

  _removeConnection(peerId, connection) {
    if (this.connections.get(peerId) !== connection) return;

    this.connections.delete(peerId);
    try { connection.close(); } catch {}
    this.onDisconnectCallback?.(peerId);

    if (!this.connections.size && !this.isHost) {
      this._setState(STATE.READY);
    }
  }

  _closeConnection(peerId, connection) {
    try { connection.close(); } catch {}
    if (this.connections.get(peerId) === connection) {
      this.connections.delete(peerId);
    }
  }

  _resetForInitialization() {
    this.destroyed = false;
    this._closeConnections();

    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
    }

    this.peer = null;
    this.hostPeerId = null;
    this.invitationCode = null;
    this.iceInfo = null;
    this._setState(STATE.IDLE);
  }

  _closeConnections() {
    for (const connection of this.connections.values()) {
      try { connection.close(); } catch {}
    }
    this.connections.clear();
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

  async getConnectionTelemetry(peerId) {
    const id = String(peerId);
    const connection = this.connections.get(id);
    const pc = connection?.peerConnection;
    const base = {
      peerId: id,
      connected: !!connection?.open,
      connectionState: pc?.connectionState || (connection?.open ? 'connected' : 'closed'),
      iceState: pc?.iceConnectionState || 'unknown',
      gatheringState: pc?.iceGatheringState || 'unknown',
      path: 'unknown',
      protocol: 'unknown',
      pingMs: null,
      packetsLost: null,
      packetsReceived: null,
      bytesSent: null,
      bytesReceived: null,
      timestamp: Date.now(),
    };
    if (!pc?.getStats) return base;

    try {
      const stats = await pc.getStats();
      let selectedPair = null;
      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId);
        }
      });
      if (!selectedPair) {
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report.selected || report.nominated)) {
            selectedPair = report;
          }
        });
      }

      const local = selectedPair ? stats.get(selectedPair.localCandidateId) : null;
      const remote = selectedPair ? stats.get(selectedPair.remoteCandidateId) : null;
      const localType = local?.candidateType || 'unknown';
      const remoteType = remote?.candidateType || 'unknown';
      const path = localType === 'relay' || remoteType === 'relay'
        ? 'relay'
        : localType === 'srflx' || remoteType === 'srflx'
          ? 'internet-direct'
          : localType === 'host' && remoteType === 'host'
            ? 'lan-direct'
            : 'direct';

      return {
        ...base,
        path,
        localCandidateType: localType,
        remoteCandidateType: remoteType,
        protocol: selectedPair?.protocol || 'unknown',
        pingMs: Number.isFinite(selectedPair?.currentRoundTripTime)
          ? Math.round(selectedPair.currentRoundTripTime * 1000)
          : null,
        packetsLost: null,
        packetsReceived: Number.isFinite(selectedPair?.packetsReceived) ? selectedPair.packetsReceived : null,
        packetsSent: Number.isFinite(selectedPair?.packetsSent) ? selectedPair.packetsSent : null,
        bytesSent: Number.isFinite(selectedPair?.bytesSent) ? selectedPair.bytesSent : null,
        bytesReceived: Number.isFinite(selectedPair?.bytesReceived) ? selectedPair.bytesReceived : null,
        timestamp: Date.now(),
      };
    } catch {
      return base;
    }
  }

  async getAllConnectionTelemetry() {
    const entries = await Promise.all(
      Array.from(this.connections.keys(), async (peerId) => [
        peerId,
        await this.getConnectionTelemetry(peerId),
      ])
    );
    return Object.fromEntries(entries);
  }

  sendTo(peerId, buffer) {
    const id = String(peerId);
    const connection = this.connections.get(id);

    if (!connection?.open || !buffer) return false;

    if (buffer.byteLength > NETWORK_CONFIG.TRANSPORT.MAX_PACKET_BYTES) {
      console.warn('[Network] Refusing oversized outbound packet', {
        peerId: id,
        bytes: buffer.byteLength,
      });
      return false;
    }

    try {
      connection.send(buffer);
      return true;
    } catch (error) {
      console.warn('[Network] Send failed', id, error);
      this._removeConnection(id, connection);
      return false;
    }
  }

  sendToHost(buffer) {
    if (this.isHost || !this.hostPeerId) return false;
    return this.sendTo(this.hostPeerId, buffer);
  }

  broadcast(buffer) {
    if (!buffer) return;
    for (const [peerId, connection] of this.connections) {
      if (connection?.open) this.sendTo(peerId, buffer);
    }
  }

  onData(callback) { this.onDataCallback = callback; }
  onConnect(callback) { this.onConnectCallback = callback; }
  onPeerConnect(callback) { this.onConnect(callback); }
  onDisconnect(callback) { this.onDisconnectCallback = callback; }
  onPeerDisconnect(callback) { this.onDisconnect(callback); }
  onStateChange(callback) { this.onStateCallback = callback; }
  onError(callback) { this.onErrorCallback = callback; }

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
    this.iceInfo = null;
    this.onDataCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
    this.onStateCallback = null;
    this.onErrorCallback = null;
    this._setState(STATE.CLOSED);
  }
}

export { STATE as PEER_STATE };
