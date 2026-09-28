import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerTransport } from '../src/network/transport/PeerTransport.js';

function createFakePeerManager() {
  const callbacks = {};
  const connections = new Map([
    ['A', { open: true }],
    ['B', { open: false }],
  ]);

  return {
    connections,
    initializeHost: (...args) => ['host', ...args],
    initializeClient: (...args) => ['client', ...args],
    sendTo: (...args) => ['send', ...args],
    sendToHost: (...args) => ['host-send', ...args],
    broadcast: (...args) => ['broadcast', ...args],
    onData: (cb) => { callbacks.data = cb; },
    onConnect: (cb) => { callbacks.connect = cb; },
    onDisconnect: (cb) => { callbacks.disconnect = cb; },
    onStateChange: (cb) => { callbacks.state = cb; },
    onError: (cb) => { callbacks.error = cb; },
    destroy: () => { callbacks.destroyed = true; },
    callbacks,
  };
}

test('transport exposes network lifecycle without leaking connection objects', () => {
  const manager = createFakePeerManager();
  const transport = new PeerTransport(manager);

  assert.deepEqual(transport.getPeerIds(), ['A', 'B']);
  assert.equal(transport.isConnected('A'), true);
  assert.equal(transport.isConnected('B'), false);
  assert.equal(transport.isConnected('missing'), false);

  assert.deepEqual(transport.initializeHost('ROOM'), ['host', 'ROOM']);
  assert.deepEqual(transport.initializeClient('HOST'), ['client', 'HOST']);
  const packet = new ArrayBuffer(1);
  assert.deepEqual(transport.sendTo('A', packet), ['send', 'A', packet]);
  assert.deepEqual(transport.sendToHost(packet), ['host-send', packet]);
  assert.deepEqual(transport.broadcast(packet), ['broadcast', packet]);
});

test('transport forwards lifecycle callback registration and peer closure', () => {
  const manager = createFakePeerManager();
  const transport = new PeerTransport(manager);
  const callbacks = {
    data() {},
    connect() {},
    disconnect() {},
    state() {},
    error() {},
  };

  transport.onData(callbacks.data);
  transport.onConnect(callbacks.connect);
  transport.onDisconnect(callbacks.disconnect);
  transport.onStateChange(callbacks.state);
  transport.onError(callbacks.error);

  assert.equal(manager.callbacks.data, callbacks.data);
  assert.equal(manager.callbacks.connect, callbacks.connect);
  assert.equal(manager.callbacks.disconnect, callbacks.disconnect);
  assert.equal(manager.callbacks.state, callbacks.state);
  assert.equal(manager.callbacks.error, callbacks.error);

  assert.equal(transport.closePeer('A'), true);
  assert.equal(transport.closePeer('missing'), false);
  transport.destroy();
  assert.equal(manager.callbacks.destroyed, true);
});
