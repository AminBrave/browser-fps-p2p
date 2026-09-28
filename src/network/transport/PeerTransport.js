/**
 * Network transport boundary.
 *
 * Network systems depend on this small interface instead of PeerJS/PeerManager
 * connection objects. Protocol encoding/decoding remains outside the transport.
 */
export class PeerTransport {
  constructor(peerManager) {
    if (!peerManager) throw new Error('PeerTransport requires a peer manager');
    this.peerManager = peerManager;
  }

  initializeHost(customRoomId = null, networkMode = undefined) {
    return this.peerManager.initializeHost(customRoomId, networkMode);
  }

  initializeClient(hostPeerId, networkMode = undefined) {
    return this.peerManager.initializeClient(hostPeerId, networkMode);
  }

  sendTo(peerId, packet) {
    return this.peerManager.sendTo(peerId, packet);
  }

  sendToHost(packet) {
    return this.peerManager.sendToHost(packet);
  }

  broadcast(packet) {
    return this.peerManager.broadcast(packet);
  }

  getPeerIds() {
    return Array.from(this.peerManager.connections?.keys?.() || []);
  }

  closePeer(peerId) {
    const connection = this.peerManager.connections?.get?.(String(peerId));
    if (!connection) return false;
    try { connection.close(); } catch {}
    return true;
  }

  isConnected(peerId) {
    return !!this.peerManager.connections?.get?.(String(peerId))?.open;
  }

  onData(callback) {
    this.peerManager.onData(callback);
  }

  onConnect(callback) {
    this.peerManager.onConnect(callback);
  }

  onDisconnect(callback) {
    this.peerManager.onDisconnect(callback);
  }

  onStateChange(callback) {
    this.peerManager.onStateChange(callback);
  }

  onError(callback) {
    this.peerManager.onError?.(callback);
  }

  destroy() {
    this.peerManager.destroy();
  }
}
