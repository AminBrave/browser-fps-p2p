# Production networking

## Time model

The authoritative host and clients use integer simulation ticks at 60 Hz. Gameplay timing should be expressed in ticks; wall-clock milliseconds are reserved for rendering, diagnostics, and transport timeouts.

## Transport lanes

The protocol is classified into three traffic classes. The current PeerJS transport keeps a compatibility-safe reliable connection, while realtime packets use sequence semantics and aggressive backpressure; the channel policy is explicit so a dual-data-channel transport can be enabled without changing simulation code.

1. Control: reliable + ordered. Join, world initialization, match state, and other state transitions.
2. Input: sequence-numbered realtime traffic. A newer input supersedes stale input; when the WebRTC buffer is high, the newest state is prioritized over queued state.
3. Snapshot: newest-state-wins realtime traffic. Remote interpolation consumes a short history rather than blocking on missing snapshots.

PeerJS exposes the underlying data-channel reliability on each DataConnection. The reliable option is appropriate for reliable control traffic, while gaming/streaming traffic should use unreliable delivery. The transport abstraction keeps these modes explicit so the underlying connection implementation can evolve without leaking PeerJS into simulation code.

## Backpressure

State traffic must never grow without bound. Snapshot/input sends are skipped or replaced when the WebRTC buffered amount is above the high watermark. Control traffic may use the reliable lane, but oversized packets are rejected.

## Prediction and reconciliation

A client records each local input with its sequence number, simulation tick, input state, and predicted position/velocity. The host acknowledges the latest processed sequence in each snapshot. Reconciliation compares authoritative state against the client's prediction at that exact acknowledged input, then replays later inputs.

## Lag compensation

The authoritative host keeps a bounded history of simplified combat hitboxes. A shot is resolved against the historical frame associated with the shot tick, clamped to the configured rewind window. Movement physics is not rewound.

Static-world occlusion is checked separately, so rewinding a target cannot make a shot pass through a wall that existed on the authoritative map.

## Metrics

Track RTT, jitter, packet loss, snapshot age, interpolation underruns, prediction correction magnitude, pending input count, frame-time p95, simulation p95, and render p95. Use p50/p95 values for tuning instead of averages alone. `ClientGame.getNetworkDiagnostics()` exposes the current transport, performance, clock-offset, interpolation, and pending-input state for developer tooling.

## Clock synchronization

The client maintains a smoothed server-tick-to-local-monotonic-clock mapping. Snapshot interpolation is scheduled against authoritative server ticks rather than raw packet arrival time, while the mapping adapts slowly to clock/jitter drift. This keeps network jitter from moving an already-buffered render timeline.

## Reconciliation quality

Local prediction is reconciled against the exact input sequence acknowledged by the host, never against the client's current predicted state. Small errors below the configured threshold are ignored; larger errors are replayed from the authoritative ACK state and rendered with a bounded visual correction so gameplay state stays authoritative without camera-visible rubber-banding.

## TURN and ICE

TURN remains a production compatibility layer for restrictive NAT/firewall combinations. Keep credentials server-side and inject only the resulting ICE configuration into the browser.

The browser starts with direct/STUN candidates and WebRTC selects a viable ICE path. Without TURN, some symmetric-NAT/firewall combinations cannot establish a direct P2P connection.

## Deployment

The repository supports:

- Railway: server.js serves the built SPA and /api/ice from one Node process.
- Vercel: Vite serves dist/ and api/ice.js provides the ICE endpoint.
- A separate PeerServer service: peer-server.js can run with npm run start:peer.

For a self-hosted PeerServer, configure VITE_PEER_SERVER_HOST, VITE_PEER_SERVER_PORT and VITE_PEER_SERVER_PATH. Keep TURN credentials out of VITE_* variables.

## Architecture rule

Do not make simulation depend on PeerJS lifecycle events. A transport opening establishes a network path; the explicit game handshake is responsible for admission and world initialization.
