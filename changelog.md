# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-09-26

### Added
- **Core Engine & ECS Framework**
  - Integrated `miniplex` for Entity-Component-System (ECS) state management.
  - Added ECS components for `Transform`, `Physics`, `Player`, `Weapon`, and `Input`.
  - Added core systems including `InputSystem`, `PhysicsSystem`, `HealthSystem`, and `RenderSystem`.

- **Physics Engine**
  - Integrated `@dimforge/rapier3d-compat` (WASM-based 3D physics engine).
  - Implemented character controller handling kinematic collisions, gravity, jumping, and floor grounding checks.
  - Added dynamic raycast weapon fire and bullet collision handling.

- **Networking & Netcode Architecture**
  - WebRTC Peer-to-Peer network layer powered by `PeerJS`.
  - Custom compact binary serialization using native JavaScript `DataView` / `ArrayBuffer` payloads.
  - **Authoritative Host System:** Broadcasts state snapshots at fixed simulation tick rates (`HostNetworkSystem`).
  - **Client-Side Prediction:** Local physics prediction for immediate player response (`ClientPredictSystem`).
  - **Server Reconciliation:** State rollback and re-simulation upon network latency mispredictions (`ClientReconcileSystem`).
  - **Entity Interpolation:** Buffer-based LERP position and angle interpolation for remote entities (`InterpolationSystem`).

- **Rendering & Assets**
  - Three.js WebGL renderer setup with dynamic shadows, tone mapping, exponential fog, and ambient lighting (`SceneManager`).
  - Asset loader utility with procedural texture generation fallbacks (`AssetLoader`).
  - Procedural arena map assembler (`createMap`).

- **User Interface & UX**
  - Full DOM overlay HUD displaying player HP, ammunition counts, crosshair, and elimination overlays (`HUD`).
  - Interactive lobby interface supporting session hosting and direct room joining via Peer IDs (`LobbyUI`).

- **Build Systems**
  - Vite configuration featuring WebAssembly (`vite-plugin-wasm`) and top-level `await` support (`vite-plugin-top-level-await`).