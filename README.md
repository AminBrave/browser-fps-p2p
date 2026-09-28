# P2P Browser FPS Arena

A browser-native multiplayer FPS built around **authoritative host simulation**, **WebRTC peer-to-peer networking**, deterministic game rules, Rapier physics, Three.js rendering, and a modular presentation layer.

**Current architecture version: 2.0.0**  
**Development branch: `architecture-overhaul`**

## Overview

P2P Browser FPS Arena is a listen-host multiplayer FPS:

- one player hosts the authoritative simulation;
- other players connect directly over WebRTC;
- clients predict their own movement and reconcile against authoritative snapshots;
- remote players are interpolated;
- gameplay rules are separated from rendering and browser-specific systems;
- physics, networking, simulation, and presentation communicate through explicit boundaries.

The project is designed so the core gameplay rules can be tested in Node without starting a browser, Three.js scene, or live WebRTC session.

## Features

### Multiplayer

- WebRTC P2P networking through PeerJS.
- Listen-host authoritative simulation.
- Explicit join/admission handshake.
- Binary game protocol.
- Client-side movement prediction.
- Server reconciliation.
- Remote-player snapshot interpolation.
- Per-client input acknowledgement.
- Bounded network queues and stale-input rejection.
- Transport lifecycle/error handling and deterministic shutdown.

### Combat

- Four weapons: pistol, SMG, shotgun, and rifle.
- Weapon-specific fire rate, recoil, spread, ammo, reload, and presentation behavior.
- Muzzle-origin bullet tracing aligned toward the crosshair target.
- Shared accuracy model used by both gameplay dispersion and crosshair presentation.
- Accuracy changes with stance, movement, sprinting, and ADS.
- Ballistic drop and distance-aware damage.
- Projectile drag and material penetration.
- Residual penetration damage loss.
- Material-aware projectile collisions.
- Authoritative entry/exit impact surfaces and penetration normals.

### Player movement

- Camera-relative FPS movement.
- Sprint.
- Crouch.
- Prone.
- Jump restrictions while prone.
- Stance-specific movement speed.
- Fixed-step simulation.
- Movement sway/bob and stance-aware camera motion.
- Weapon sway tied to movement state.

### World & physics

- Outdoor arena with grass, paths, crates, trees, cars, barriers, mountains, and boundaries.
- Declarative world definitions in `src/config/world.js`.
- Shared dimensions for rendered geometry and physical colliders.
- Compound physical objects for cars and trees.
- Stable collider-to-entity mapping.
- Physics-safe spawn validation.
- Invisible safety floor below the playable world.
- Rapier-backed collision and ray queries.

### Impact & presentation

- Material-specific bullet impact reactions.
- Impact particles and sparks.
- Persistent bullet decals.
- Surface-normal-aligned decals.
- Car impacts mapped to the exact visible body/cabin/wheel part.
- Transient tracer/particle lifecycle owned by presentation.
- Player blood/impact presentation synchronized with health state.
- Configurable render budgets for impact effects.

### Audio & HUD

- Procedural Web Audio effects.
- Weapon-specific firing audio.
- Reload, empty-click, footsteps, jump/land, impact, hit, and death feedback.
- Health and ammunition HUD.
- Weapon/slot information.
- Reload and fire-mode state.
- Control hints.
- Dynamic accuracy-driven crosshair.

## Architecture

The project is intentionally divided into layers.

```text
Browser / UI
    |
    +-- HostGame / ClientGame
    |
    +-- ECS orchestration
    |
    +-- Simulation models
    |     movement
    |     combat
    |     health
    |     weapons
    |     ballistics
    |     prediction / reconciliation
    |
    +-- Networking
    |     transport
    |     binary protocol
    |     snapshots
    |
    +-- Physics
    |     Rapier world
    |     character physics
    |     ray queries
    |     spawn safety
    |
    +-- Presentation
          Three.js rendering
          weapon viewmodels
          impact effects
          tracers
          player/world views
```

### Core architectural rules

1. **Simulation does not depend on rendering.** Pure gameplay rules live under `src/game/simulation/`.
2. **Networking is a boundary.** PeerJS/WebRTC lifecycle is not the gameplay protocol.
3. **Physics is a boundary.** Rapier-specific implementation stays under `src/physics/`.
4. **Presentation owns visuals.** Three.js, transient effects, decals, and viewmodels stay under `src/presentation/` and `src/render/`.
5. **World definitions are data.** Map/object dimensions and placements are centralized in configuration/world definitions.
6. **Host authority is explicit.** Clients predict and render locally, but the host remains authoritative for simulation results.
7. **Fixed-step simulation is deterministic.** Rendering frequency must not change gameplay progression.
8. **Every regression should have a test.** Boundary and protocol behavior is tested without requiring a live browser session.

## Technology stack

| Layer | Technology |
|---|---|
| Language | JavaScript (ES modules) |
| Build | Vite |
| Rendering | Three.js |
| Physics | `@dimforge/rapier3d-compat` |
| ECS | Miniplex |
| Networking | PeerJS / WebRTC DataChannels |
| Testing | Node.js built-in test runner |
| Deployment | Railway (SPA + runtime API) |
| ICE/TURN | Runtime-configured ICE provider |

## Project structure

```text
src/
├── config/                  Shared gameplay, world, network and render configuration
├── core/                    Fixed-step game loop
├── ecs/
│   ├── components/          Simulation components
│   ├── entities/            ECS composition
│   └── systems/             Gameplay and network orchestration
├── game/
│   ├── simulation/          Pure movement, combat, health and network models
│   ├── player/              Player composition
│   └── world/               World definitions and composition
├── network/                 Protocol, transport, peers and world sync
├── physics/                 Rapier world, queries, collision and spawn safety
├── presentation/            Rendering-facing gameplay presentation
├── render/                  Scene and weapon viewmodels
├── audio/                   Procedural audio
├── ui/                      Lobby and HUD
└── utils/                   Shared deterministic utilities

test/
├── combat/
├── config/
├── integration/
├── network/
├── physics/
├── presentation/
├── simulation/
└── utils/

docs/
├── architecture/            Architecture phase contracts
├── NETWORKING.md             Production networking and WebRTC deployment
└── TESTING.md                Testing strategy and conventions
```

## Requirements

- Node.js 20+ recommended.
- A modern browser with WebRTC, Web Audio, WebGL, and Pointer Lock support.
- For broad Internet multiplayer coverage, production deployment should provide a functioning TURN service.

## Local development

Clone the repository and switch to the architecture branch:

```bash
git clone https://github.com/AminBrave/browser-fps-p2p.git
cd browser-fps-p2p
git checkout architecture-overhaul
npm install
npm run dev
```

Open the local Vite URL in your browser.

## Playing locally

1. Open the game in one browser tab/window.
2. Choose **Host**.
3. Copy the generated invitation code.
4. Open a second tab/window.
5. Choose **Join** and enter the invitation code.
6. Click the game canvas to acquire pointer lock.

### Controls

| Input | Action |
|---|---|
| W / A / S / D | Move |
| Shift | Sprint |
| Mouse | Look |
| Left mouse | Fire |
| Right mouse | Aim / zoom |
| R | Reload |
| 1–4 | Switch weapons |
| C | Crouch |
| Z | Prone |
| Space | Jump |

## Testing

The project uses Node's built-in test runner.

```bash
npm test
npm run test:coverage
npm run test:watch
```

Tests are organized by architectural responsibility rather than browser screen:

- simulation and movement;
- combat and ballistics;
- protocol and network systems;
- physics boundaries;
- presentation ownership;
- configuration and deterministic utilities;
- cross-module architecture/determinism invariants.

See [docs/TESTING.md](docs/TESTING.md) for the testing rules.

## Production deployment

The Railway production service builds the Vite frontend and runs `npm start`, which serves both the SPA and the server-side `/api/ice` TURN configuration endpoint. Set `METERED_TURN_CREDENTIAL_URL` and `METERED_TURN_API_KEY` as Railway service variables; these remain server-side.

## Production networking

The application separates:

1. **Signaling** — PeerJS exchanges connection metadata.
2. **ICE/STUN/TURN** — WebRTC establishes a network path.
3. **Data transport** — the reliable ordered data channel carries game packets.
4. **Game protocol** — explicit join/admission messages initialize the game session.

For production deployment, configure the ICE/TURN environment variables described in [docs/NETWORKING.md](docs/NETWORKING.md). Do not put provider secret keys in browser code.

A TURN service is important for peers behind restrictive NAT/firewall configurations. PeerServer is signaling infrastructure; it does not replace TURN.

## Testing philosophy

This project favors deterministic, boundary-focused tests:

- inject randomness where simulation needs it;
- test binary packets as byte-level contracts;
- test stale/duplicate network input;
- test prediction and reconciliation mathematically;
- keep Three.js, DOM, WebRTC, and Rapier integration separate from pure unit tests;
- add a regression test for every important bug;
- avoid real wall-clock timing in deterministic tests.

## Resource lifecycle

A game session owns its simulation, physics, networking, and presentation resources. Shutdown paths explicitly release:

- WebRTC transports and callbacks;
- ECS/session references;
- Rapier worlds and collider mappings;
- Three.js scenes, geometries, materials, textures, and renderer resources;
- presentation effects and collider bindings.

This prevents old matches from retaining objects from previous sessions.

## Limitations

- The host is authoritative; if the host disconnects, the current match ends.
- Bullet decals and some presentation effects are local visual state rather than replicated world state.
- P2P connectivity depends on browser/WebRTC networking conditions.
- Broad Internet coverage requires correctly configured TURN infrastructure.
- The current test suite focuses on deterministic core logic and architectural boundaries; full browser/WebRTC end-to-end testing remains a separate integration layer.

## Documentation

- [Changelog](changelog.md)
- [Testing guide](docs/TESTING.md)
- [Networking guide](docs/NETWORKING.md)
- [Architecture contracts](docs/architecture/PHASE-0-CONTRACTS.md)
- [Core simulation](docs/architecture/PHASE-1-CORE-SIMULATION.md)
- [Networking boundaries](docs/architecture/PHASE-2-NETWORKING.md)
- [Physics boundaries](docs/architecture/PHASE-3-PHYSICS-BOUNDARIES.md)

## License

MIT.
