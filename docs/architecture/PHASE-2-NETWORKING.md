# Architecture Overhaul — Phase 2 Networking

Phase 2 establishes the network boundary as an explicit trust boundary.

## Client input contract

`src/network/InputValidator.js` is the first validation layer after binary decoding.

It rejects:

- missing or malformed input objects;
- non-finite yaw/pitch;
- pitch outside the gameplay limit;
- unknown input-mask bits;
- invalid sequence numbers;
- invalid weapon-slot values;
- non-boolean aim state.

Yaw is normalized into `[-PI, PI]` before entering simulation.

The validator returns a frozen plain-data object. It does not depend on ECS, Rapier, Three.js, PeerJS, or DOM APIs.

## Host input queue

`HostNetworkSystem` owns the authoritative per-peer input queue.

The queue is bounded by `NETWORK_CONFIG.MAX_INPUT_QUEUE` (16 frames).

Overflow does not silently discard frames. The peer is rejected instead because dropping unprocessed input would make the authoritative simulation timeline diverge from the client's prediction/replay timeline.

## Authority rule

The host remains authoritative for:

- player movement state;
- physics results;
- combat traces;
- damage;
- health/lifecycle;
- world snapshots and acknowledgement sequence.

Clients may submit input intent, but they cannot submit authoritative transforms, health, damage, or hit results.

## Phase 2 verification

Tests cover the pure input validation boundary. End-to-end network behavior still requires local browser testing with host/client peers.

## Reconciliation correction

`ClientReconcileSystem` now distinguishes two different errors:

1. authoritative-vs-predicted-at-ACK, used to decide whether a correction is necessary;
2. predicted-current-vs-corrected-current, used for the renderer's visual smoothing offset.

These must not be conflated: the first is a historical simulation comparison, while the second preserves the player's current prediction when the server correction is applied.

## Protocol boundary

Binary decoders now enforce packet type and fixed-size boundaries for fixed packets. Variable JSON packets require their declared payload length to exactly match the received packet length. Snapshot decoding rejects truncated or trailing bytes.

This keeps malformed packets from reaching gameplay systems and makes protocol failures deterministic rather than relying on downstream consumers to tolerate invalid data.

## Remaining Phase 2 work

- separate transport from protocol encoding;
- formalize snapshot history and acknowledgement semantics;
- verify client reconciliation against the acknowledged authoritative frame;
- add remote snapshot interpolation buffering guarantees;
- isolate network packet schemas from ECS entity objects;
- add protocol fuzz/negative tests for malformed binary packets.
