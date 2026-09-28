import test from 'node:test';
import assert from 'node:assert/strict';
import { Protocol } from '../../src/network/Protocol.js';
import { NETWORK_CONFIG } from '../../src/config/index.js';

test('world-init packets enforce maximum transport size', () => {
  const max = Math.max(1024, Number(NETWORK_CONFIG.TRANSPORT?.MAX_PACKET_BYTES) || 1024 * 1024);
  assert.throws(() => Protocol.encodeWorldInit({ data: 'x'.repeat(max + 1024) }), /maximum size/i);
});

test('game-event decoder rejects length mismatches', () => {
  const packet = Protocol.encodeGameEvent({ ok: true });
  const bytes = new Uint8Array(packet);
  bytes[1] = 0xff; bytes[2] = 0xff; bytes[3] = 0xff; bytes[4] = 0xff;
  assert.equal(Protocol.decodeGameEvent(packet), null);
});
