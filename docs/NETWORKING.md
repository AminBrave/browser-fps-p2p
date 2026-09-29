# Production networking

The game uses four separate networking layers:

1. Signaling — PeerJS exchanges connection metadata and ICE candidates.
2. ICE/STUN/TURN — WebRTC finds a usable network path. TURN is the relay fallback for restrictive NAT/firewalls.
3. Data transport — one reliable, ordered binary WebRTC data channel carries the game protocol.
4. Game protocol — an explicit JOIN_REQUEST/JOIN_ACCEPT handshake gates admission and world initialization.

## Railway deployment

The repository supports two frontend/API deployment modes:

- **Railway:** `server.js` serves the built SPA and `/api/ice` from one Node process.
- **Vercel:** Vite serves the `dist/` output and `api/ice.js` provides the same endpoint as a Vercel Function.

The browser networking code is the same in both deployments.

TURN is **optional**. The normal connection path is direct WebRTC plus STUN. If you operate your own TURN server, configure it on Railway with:

- `TURN_URLS_JSON` — JSON array such as `["turn:turn.example.com:3478","turns:turn.example.com:5349"]`
- `TURN_USERNAME` — server-issued TURN username
- `TURN_CREDENTIAL` — server-issued TURN credential

An optional external TURN provider can be configured as a last-resort infrastructure option with `TURN_CREDENTIAL_URL` and `TURN_API_KEY`.

Do not put TURN credentials in `VITE_*` variables or browser code. The Node server keeps credentials server-side and returns only the ICE configuration.

The browser always starts with direct/STUN candidates. WebRTC evaluates all available ICE candidates and automatically selects a working path. If no TURN service is configured, the game continues normally; some restrictive NAT/firewall combinations may still be unable to establish P2P.

Railway provides the `PORT` environment variable to the service; the production start command is `npm start`.

After changing Railway variables, redeploy the service so the new deployment receives them.

## Vercel deployment

The same repository can be deployed to Vercel without changing the client networking code.

Vercel serves the Vite `dist/` output and runs `api/ice.js` as the `/api/ice` function. Vercel does **not** run the Railway `server.js` process.

The ICE endpoint supports the same progressive strategy as Railway:

- no TURN variables: direct WebRTC + STUN only;
- `TURN_URLS_JSON`, `TURN_USERNAME`, `TURN_CREDENTIAL`: self-hosted TURN;
- `TURN_CREDENTIAL_URL`, `TURN_API_KEY`: optional external TURN as a final relay option.

For Vercel, configure the same environment variables in the Vercel project settings. Never expose TURN credentials through `VITE_*` variables.

### Signaling

The game uses PeerJS for signaling. Vercel and Railway do not turn `server.js` into a persistent PeerServer automatically.

The repository includes `peer-server.js` for a portable self-hosted signaling service. On Railway, create a small second service from this repository and set its start command to:

```text
npm run start:peer
```

Railway supplies `PORT`; optionally set `PEER_SERVER_PATH=/peerjs`. Behind Railway's HTTPS proxy, the client should use TLS:

```text
VITE_PEER_SERVER_HOST=your-peer-server.example.com
VITE_PEER_SERVER_PORT=443
VITE_PEER_SERVER_PATH=/peerjs
```

If `VITE_PEER_SERVER_HOST` is omitted, PeerJS falls back to PeerJS Cloud. For minimum third-party usage, configure the included self-hosted PeerServer instead. PeerJS documents that its server is signaling infrastructure and that TURN remains a separate concern.

## Signaling server

By default the client uses PeerJS Cloud. For a production deployment, set:

- VITE_PEER_SERVER_HOST
- VITE_PEER_SERVER_PORT (normally 443 behind TLS)
- VITE_PEER_SERVER_PATH (for example /peerjs)

The PeerJS documentation recommends running your own PeerServer for production/high traffic. PeerServer is signaling only; it does not replace TURN.

A PeerServer can run on a separate persistent service such as Railway. If the game itself is also hosted on Railway, keep the PeerServer as a separate service and point these variables at its public TLS endpoint.

## Progressive connectivity strategy

The networking stack intentionally minimizes third-party dependencies:

1. Direct WebRTC candidates are attempted by the browser.
2. STUN provides public-address discovery.
3. Self-hosted TURN is the preferred relay fallback when configured.
4. An optional external TURN provider can be enabled only when additional relay coverage is needed.

These are ICE candidates rather than application-level sequential reconnects: WebRTC evaluates the candidates and selects a viable network path. A player on a compatible network therefore remains fully peer-to-peer without using TURN.

TURN is a compatibility layer, not a hard application dependency.

## Debugging

Open DevTools on both players. Successful connections log:

- signaling state
- ICE gathering state
- ICE connection state
- WebRTC connection state
- selected candidate type
- RTT

The selected candidate type should normally be host, srflx, or relay. If Internet players fail and the log says TURN=unavailable, verify the Railway TURN variables and request `/api/ice` directly. It should return JSON, not the SPA's `index.html`.

If the error is peer-unavailable, the invitation code is not currently registered with the signaling server. If it is webrtc, signaling succeeded but ICE/WebRTC negotiation failed. PeerJS documents these error classes separately.

## Architecture rule

Do not make the game simulation depend on PeerJS lifecycle events. A transport opening only establishes a network channel. The explicit game handshake is responsible for admission and world initialization.


## Regional / national-network deployment

Treat global and locally reachable infrastructure as two interchangeable infrastructure planes rather than hard-coding a country-specific mode into gameplay.

A deployment that must remain usable when international routes are unavailable needs all three of these reachable from the isolated network:

1. **Game origin** — the HTML/JS/assets must be mirrored on a locally reachable HTTPS origin.
2. **Signaling** — a locally reachable PeerServer must broker the SDP/ICE handshake. The browser still needs signaling even when players are on the same LAN; the gameplay data channel is what becomes direct after signaling.
3. **TURN** — a locally reachable TURN service should be available for CGNAT, client isolation, firewall restrictions, or UDP blocking. Use TURN/TLS on a locally reachable TLS endpoint when the network only permits TCP/TLS.

The application should select infrastructure by endpoint reachability, not by country detection:

- auto: try the configured local/regional bootstrap first, then the global bootstrap when reachable;
- local: use only the locally reachable game/signaling/ICE services;
- global: use only the global services.

The current WebRTC connection mode (auto, direct, relay, relay-tcp-tls) remains a separate per-device transport preference. It must not be synchronized between players.

A practical isolated-network topology is:

local HTTPS origin -> local PeerServer -> WebRTC direct host/client path -> local TURN fallback

For a same-LAN match, the selected ICE path will commonly be host-to-host. For harder NAT/firewall cases, the local TURN server becomes the relay. STUN is optional for same-LAN connectivity but useful when direct public/NAT-mapped candidates are needed.

Do not assume that a specific network permits WebRTC UDP, TCP, or TLS traffic. Validate the actual network policy and provide a TURN/TLS option if required.

## Multiplayer identity, presence and telemetry

The match protocol now separates **simulation state** from **session state**:

- WORLD_SNAPSHOT remains authoritative gameplay state.
- SESSION_STATE is a low-frequency roster/presence/telemetry snapshot.
- Player display names are supplied during JOIN_REQUEST and sanitized locally.
- The host is authoritative for online/left presence and broadcasts the roster.
- Each connection exposes WebRTC RTCPeerConnection.getStats() telemetry.

The telemetry currently records:

- RTT/ping in milliseconds;
- selected ICE path: lan-direct, internet-direct, or relay;
- local and remote candidate type;
- selected transport protocol;
- PeerConnection state;
- ICE state;
- transport packet/byte counters when exposed by the browser.

The HUD shows the roster continuously and Tab toggles it. DevTools also receive periodic [Multiplayer] telemetry logs.

The displayed RTT is the RTT of the host/client WebRTC connection, not a claim that every pair of clients has a direct path. This distinction matters because the current authoritative topology is star-shaped: clients connect to the host, not to every other player. WebRTC's selected ICE candidate pair exposes currentRoundTripTime, and the selected candidate type distinguishes host, server-reflexive, and relay paths.

## Multiplayer feature roadmap

The next protocol additions should remain separate from the high-frequency simulation snapshot:

- match lifecycle: waiting -> starting -> live -> ending -> finished;
- ready state / team assignment / spectator state;
- join/leave/reconnect events;
- kill feed and combat event feed;
- score/objective state;
- reconnect with session token and player identity restoration;
- explicit connection-quality states (good, degraded, critical) based on measured telemetry;
- server tick / snapshot age / interpolation delay diagnostics;
- application-level heartbeat RTT for cases where ICE stats are unavailable;
- optional chat and voice as separate channels;
- abuse/rate-limit validation for all client-originated metadata.

Keep chat, presence and diagnostics off the 60 Hz gameplay packet path. The current one-second SESSION_STATE cadence is intentionally low frequency so the lobby/HUD can stay informative without competing with input and snapshot traffic.

PeerJS exposes the underlying RTCPeerConnection on a DataConnection, so the telemetry layer can inspect WebRTC stats without replacing the transport abstraction.
