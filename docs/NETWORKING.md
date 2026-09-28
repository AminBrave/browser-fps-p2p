# Production networking

The game uses four separate networking layers:

1. Signaling — PeerJS exchanges connection metadata and ICE candidates.
2. ICE/STUN/TURN — WebRTC finds a usable network path. TURN is the relay fallback for restrictive NAT/firewalls.
3. Data transport — one reliable, ordered binary WebRTC data channel carries the game protocol.
4. Game protocol — an explicit JOIN_REQUEST/JOIN_ACCEPT handshake gates admission and world initialization.

## Railway deployment

The Railway service runs the built SPA and the server-side `/api/ice` endpoint from the same Node process.

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

The game uses PeerJS for signaling. Vercel hosting the frontend and `/api/ice` does not automatically provide a dedicated PeerServer for this game. If `VITE_PEER_SERVER_HOST` is not set, PeerJS uses its configured/default signaling behavior. For a minimum-third-party production setup, run your own PeerServer on a persistent host such as Railway and point the Vercel frontend at it:

```text
VITE_PEER_SERVER_HOST=your-peer-server.example.com
VITE_PEER_SERVER_PORT=443
VITE_PEER_SERVER_PATH=/
```

This separates static/API hosting from the persistent signaling service and works with both Vercel and Railway deployments.

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
