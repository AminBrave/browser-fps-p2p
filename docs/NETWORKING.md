# Production networking

The game uses four separate networking layers:

1. Signaling — PeerJS exchanges connection metadata and ICE candidates.
2. ICE/STUN/TURN — WebRTC finds a usable network path. TURN is the relay fallback for restrictive NAT/firewalls.
3. Data transport — one reliable, ordered binary WebRTC data channel carries the game protocol.
4. Game protocol — an explicit JOIN_REQUEST/JOIN_ACCEPT handshake gates admission and world initialization.

## Railway deployment

The Railway service runs the built SPA and the server-side /api/ice endpoint from the same Node process.

Set these Railway service variables:

- METERED_TURN_CREDENTIAL_URL
  - Example: https://YOUR_APP.metered.live/api/v1/turn/credentials
- METERED_TURN_API_KEY
  - The credential-scoped TURN API key from Metered.

The browser calls /api/ice on the same origin. The Node server calls Metered and returns only the ICE server configuration. The Metered API key never reaches browser JavaScript.

Railway provides the PORT environment variable to the service; the production start command is `npm start`.

After adding/changing Railway environment variables, redeploy the service so the new deployment receives them.

## Signaling server

By default the client uses PeerJS Cloud. For a production deployment, set:

- VITE_PEER_SERVER_HOST
- VITE_PEER_SERVER_PORT (normally 443 behind TLS)
- VITE_PEER_SERVER_PATH (for example /peerjs)

The PeerJS documentation recommends running your own PeerServer for production/high traffic. PeerServer is signaling only; it does not replace TURN.

A PeerServer can run on a separate persistent service such as Railway. If the game itself is also hosted on Railway, keep the PeerServer as a separate service and point these variables at its public TLS endpoint.

## Why TURN is mandatory for broad Internet coverage

STUN can discover public-facing addresses and often enables direct peer-to-peer connections. Some NAT/firewall combinations cannot form a direct path; PeerJS explicitly documents TURN as the workaround for symmetric NAT.

The previous implementation used hard-coded public TURN credentials. Those are not a production networking dependency. This implementation removes them from source control and loads the provider's current ICE configuration at runtime.

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
