# Production networking

## Time model

The authoritative host and clients use integer simulation ticks at 60 Hz. Gameplay timing should be expressed in ticks; wall-clock milliseconds are reserved for rendering, diagnostics, and transport timeouts.

## Transport lanes

The logical protocol is split into three traffic classes:

1. Control: reliable + ordered. Join, world initialization, match state, and other state transitions.
2. Input: unreliable + sequence-numbered. A newer input supersedes stale input; the simulation never waits for an old packet.
3. Snapshot: unreliable + newest-state-wins. Remote interpolation consumes a short history rather than blocking on missing snapshots.

PeerJS exposes the underlying data-channel reliability on each DataConnection. The reliable option is appropriate for reliable control traffic, while gaming/streaming traffic should use unreliable delivery. The transport abstraction keeps these modes explicit so the underlying connection implementation can evolve without leaking PeerJS into simulation code.

## Backpressure

State traffic must never grow without bound. Snapshot/input sends are skipped or replaced when the WebRTC buffered amount is above the high watermark. Control traffic may use the reliable lane, but oversized packets are rejected.

## Prediction and reconciliation

A client records each local input with its sequence number, simulation tick, input state, and predicted position/velocity. The host acknowledges the latest processed sequence in each snapshot. Reconciliation compares authoritative state against the client's prediction at that exact acknowledged input, then replays later inputs.

## Lag compensation

The authoritative host keeps a bounded history of simplified combat hitboxes. A shot is resolved against the historical frame associated with the shot tick, clamped to the configured rewind window. Movement physics is not rewound.

This keeps historical hit registration proportional to player count and avoids mutating the complete physics world for every shot.

## Metrics

Track RTT, jitter, packet loss, snapshot age, interpolation underruns, prediction correction magnitude, and pending input count. Use p50/p95 values for tuning instead of averages alone.

## TURN

TURN remains a production compatibility layer for restrictive NAT/firewall combinations. Keep credentials server-side and inject only the resulting ICE configuration into the browser.
