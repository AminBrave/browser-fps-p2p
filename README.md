# P2P Browser FPS Arena

A high-performance, real-time multiplayer First-Person Shooter (FPS) built to run directly in modern web browsers. It uses a **Listen-Host Peer-to-Peer (P2P) network architecture** powered by WebRTC DataChannels and an **Entity Component System (ECS)** pattern.

---

## 🚀 Key Features

* **Zero Backend Server Cost:** Operates via a browser-to-browser P2P topology using PeerJS for the initial signaling handshake.
* **High-Performance Physics:** Integrates **Rapier3D** (WASM-compiled physics engine) for deterministic collision detection, raycasting, and rigid-body movement.
* **Entity Component System (ECS):** Decouples game state data from logic and rendering loops to maximize performance and avoid garbage collection pauses.
* **Network Latency Compensation:** Features client-side prediction, host reconciliation, and entity interpolation to ensure smooth gameplay across consumer internet connections.
* **Binary Serialization:** Packs state updates and inputs into compact `ArrayBuffers` to minimize network overhead.

---

## 🛠️ Technology Stack

* **Core Logic / Architecture:** Entity Component System (BitECS / Miniplex style data layout)
* **3D Graphics & Rendering:** Three.js (WebGL)
* **Physics Engine:** Rapier3D (`@dimforge/rapier3d-compat` via WebAssembly)
* **Networking Protocol:** WebRTC DataChannels (Unreliable/Unordered mode mimicking UDP) via PeerJS
* **Build Tool:** Vite

---

## 📂 Project Directory Structure

```text
browser-fps-p2p/
├── public/
│   ├── assets/
│   │   ├── models/            # 3D GLTF/GLB models (weapons, player avatars, map geometry)
│   │   ├── textures/          # Map textures, crosshairs, skybox
│   │   └── audio/             # Sound effects (gunshots, footsteps, impacts)
│   └── index.html             # Entry HTML container
│
├── src/
│   ├── config/
│   │   ├── constants.js       # Tick rates (60Hz loop), network send rates (30Hz), player speed
│   │   └── controls.js        # Default keybindings and mouse sensitivity settings
│   │
│   ├── ecs/
│   │   ├── components/        # Data-only schemas (BitECS / TypedArrays)
│   │   │   ├── Transform.js   # Position (x,y,z), Rotation (y)
│   │   │   ├── Physics.js     # Rigid body handle, Velocity (x,y,z), Collider shape
│   │   │   ├── Player.js      # Player ID, Peer ID, IsLocal, Health, Ammo
│   │   │   ├── Weapon.js      # Fire rate, Recoil, Damage, Cooldown
│   │   │   └── Input.js       # Action bitflags (W,A,S,D,Shoot,Jump), Look Angles (Pitch, Yaw)
│   │   │
│   │   ├── entities/          # Entity assembly factory functions
│   │   │   ├── createPlayer.js# Creates a player entity with Transform, Physics, Health
│   │   │   ├── createBullet.js# Instant projectile or raycast line setup
│   │   │   └── createMap.js   # Static map collider geometry
│   │   │
│   │   └── systems/           # Pure logic execution functions
│   │       ├── InputSystem.js # Captures DOM keyboard/mouse events -> Input Component
│   │       ├── PhysicsSystem.js # Steps Rapier3D WASM world engine
│   │       ├── HealthSystem.js  # Host-only: Checks health state, applies damage, triggers respawns
│   │       ├── RenderSystem.js  # Reads ECS Transform data -> Updates Three.js Meshes
│   │       │
│   │       └── network/       # Netcode-specific systems
│   │           ├── HostNetworkSystem.js    # Host: Collects player inputs, broadcasts world snapshots
│   │           ├── ClientPredictSystem.js  # Client: Immediate local movement simulation
│   │           ├── ClientReconcileSystem.js# Client: Snaps/corrects local prediction vs Host state
│   │           └── InterpolationSystem.js  # Client: Smoothly buffers & lerps remote players
│   │
│   ├── network/
│   │   ├── PeerManager.js     # PeerJS setup, room creation, WebRTC DataChannel handlers
│   │   ├── Protocol.js        # Binary ArrayBuffer encoders/decoders (Packets <-> ECS)
│   │   └── PacketTypes.js     # Enum constants for packet headers (JOIN, INPUT, SNAPSHOT, DISCONNECT)
│   │
│   ├── physics/
│   │   └── PhysicsWorld.js    # Initializes Rapier3D WASM instance and physics step configuration
│   │
│   ├── render/
│   │   ├── SceneManager.js    # Three.js Scene, Camera, WebGLRenderer, and Light setup
│   │   └── AssetLoader.js     # GLTF/Texture loading queues & caching
│   │
│   ├── ui/                    # Non-ECS DOM/Canvas Overlay UI
│   │   ├── HUD.js             # Health, Ammo, Hitmarkers, Leaderboard overlay
│   │   └── LobbyUI.js         # Room creation input, Join Room ID form, Peer status
│   │
│   ├── utils/
│   │   ├── BitFlags.js        # Helper utility to compress inputs into single-byte integers
│   │   └── CircularBuffer.js  # Ring buffer for client prediction input history
│   │
│   ├── HostGame.js            # Main loop wrapper when playing as HOST (Runs full simulation)
│   ├── ClientGame.js          # Main loop wrapper when playing as CLIENT (Prediction + Render only)
│   └── index.js               # Application entrypoint & state router
│
├── .gitignore
├── package.json
├── README.md
└── vite.config.js             # Vite configuration (supports WebAssembly for Rapier3D)
```

---

## ⚙️ Getting Started & Local Installation

### Prerequisites

* Node.js (v18+ recommended)
* npm or yarn

### 1. Clone and Install Dependencies

```bash
git clone [https://github.com/your-username/browser-fps-p2p.git](https://github.com/your-username/browser-fps-p2p.git)
cd browser-fps-p2p
npm install

```

### 2. Run the Development Server

Start the local Vite development server:

```bash
npm run dev

```

Open your browser and navigate to the local URL provided in your terminal (typically `http://localhost:5173` or `http://localhost:3000`).

---

## 🕹️ How to Test & Play

### Local Multi-Tab Testing (Same Machine)

1. Open your browser to the local dev server URL.

2. **Tab 1 (Host):** Click **Host New Game**. Copy the generated **Room ID** displayed on the screen.

3. **Tab 2 (Client):** Open a second browser tab (or an Incognito window), paste the Room ID into the input field, and click **Join Game**.

4. Move and shoot to verify that positions and actions sync properly across tabs.

### Online Testing with Friends

Because the game uses WebRTC data channels, friends can connect directly over the internet without a dedicated gameserver.

* **Quick Tunneling:** Use a service like ngrok or localtunnel to expose your local dev server securely:

```bash
npx localtunnel --port 5173

```

Share the generated HTTPS link and the generated Room ID with your friends.

* **Production Deployment:** Build and deploy the static frontend assets to a free hosting provider (such as Vercel, Netlify, or GitHub Pages):

```bash
npm run build

```

---

## 📜 Architectural Trade-offs & Limitations

* **Host Advantage:** The player acting as the Host runs the authoritative simulation with 0ms local latency.
* **Host Drop-Off:** Because it is a P2P Listen-Host model, if the host disconnects or closes their browser tab, the match terminates for all connected clients.

* **NAT Traversal:** Direct peer-to-peer connections rely on public STUN/TURN traversal. Strict corporate or university firewalls may occasionally block direct WebRTC data channels.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

```

```
