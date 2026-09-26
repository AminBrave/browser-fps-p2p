# Changelog

All notable changes to this project will be documented in this file.

## [1.0.3] - 2026-09-26

### Fixed (comprehensive runtime bug pass)

* **Constants:**
  * Added missing `GAME_CONFIG.TICK_RATE`, `FOV`, `NEAR_PLANE`, `FAR_PLANE`, `INTERPOLATION_DELAY_MS`, `RECONCILIATION_THRESHOLD` (prevented NaN camera and broken fixed timestep).
  * Added `peerIdToNumeric()` for stable numeric entity IDs from PeerJS string IDs.

* **Player / Weapon identity:**
  * `createPlayer` now hashes peer ID strings to unique numeric `player.id` values so host snapshots and client reconciliation can match entities.
  * Weapon component exposes both `ammo` and `currentAmmo` (HUD was reading `weapon.ammo` which was always undefined).
  * Player component includes `maxHealth`.

* **PeerManager:**
  * `initClient` / `initializeClient` now resolves with the local PeerJS id (was resolving `undefined`).
  * Added `sendToHost()` used by ClientGame.
  * Stores `hostPeerId` for reliable client→host sends.

* **Protocol:**
  * Added `getPacketType()`, `encodeInput(payload object)`, `decodeSnapshot` alias.
  * `decodeWorldSnapshot` accepts ArrayBuffer or DataView, stamps `timestamp`, and provides `players` alias.
  * `PACKET_TYPES.STATE_SNAPSHOT` alias for `WORLD_SNAPSHOT`.

* **CircularBuffer:**
  * Added `peek()`, `shift()`, `toArray()` required by ClientReconcileSystem.

* **ClientPredictSystem / InterpolationSystem:**
  * Fully migrated to Miniplex v2 entity objects (removed non-existent `ecsWorld.getComponent`).
  * Rapier API fallbacks for `computedMovement` / `computedGrounded`.
  * Interpolation uses entity object arrays and snapshot `players`/`entities` + timestamps.

* **ClientGame:**
  * Fixed `onData` callback signature `(peerId, dataView)`.
  * Fixed Protocol encode/decode calls and packet type checks.
  * Passes SceneManager consistently into `createMap` / `createPlayer`.
  * Calls `sceneManager.render()` in the client loop.
  * Remote entity sync matches on numeric id.

* **HostNetworkSystem:**
  * Constructor no longer mis-treats physicsWorld as Protocol.
  * Matches remote inputs by `player.peerId`.
  * Rate-limits snapshot broadcast to ~30 Hz.
  * Uses latest input per tick instead of only shifting one frame.

* **HostGame:**
  * Disconnect cleanup matches on `peerId`.
  * Consistent SceneManager usage and HUD ammo aliases.

---

## [1.0.2] - 2026-09-26

### Fixed
* **Physics & Character Controller:**
  * Fixed `Uncaught TypeError: physics.controller.getComputedMovement is not a function` in `PhysicsSystem.js` and `ClientReconcileSystem.js` by migrating to Rapier3D API methods (`computedMovement()` and `computedGrounded()`) with fallback checks.
  * Resolved player movement freezing issue caused by unhandled exceptions breaking the `HostGame` and `ClientGame` main tick loops.

* **Input Sampling & Prediction:**
  * Updated `InputSystem.update()` to explicitly construct and return the frame's `inputPayload` object (`sequence`, `inputMask`, `yaw`, `pitch`), enabling client-side movement prediction and host input packet serialization.

---

## [1.0.1] - 2026-09-26

### Fixed
* **UI & DOM Initialization:**
  * Fixed `TypeError` in `LobbyUI.js` and `HUD.js` by scoping element queries directly to component containers (`this.container.querySelector`) instead of global `document.getElementById` lookup before mounting.

* **ECS & Entity Engine (Miniplex v2 Migration):**
  * Fixed `TypeError: ecsWorld.createEntity is not a function` in `createMap.js`, `createPlayer.js`, and `createBullet.js` by updating entity creation logic to `ecsWorld.add(...)`.
  * Fixed `TypeError: ecsWorld.getComponent is not a function` in `RenderSystem.js` and `ClientReconcileSystem.js` by refactoring queries to `ecsWorld.with(...)` iterators and direct component property access.
  * Fixed `TypeError: Cannot read properties of undefined (reading 'length')` in `HealthSystem.update` by validating damage queue inputs and updating player queries to Miniplex v2 iterators.

* **Networking & Synchronization:**
  * Fixed `TypeError: this.peerManager.initializeHost is not a function` in `HostGame.js` by adding alias methods (`initializeHost`, `initializeClient`, `onPeerConnect`, `onPeerDisconnect`) to `PeerManager.js`.
  * Fixed `TypeError: this.protocol.encodeSnapshot / encodeWorldSnapshot is not a function` in `HostNetworkSystem.js` by standardizing method signatures, adding argument normalization, and supporting method aliases in `Protocol.js`.

* **Input & Controls:**
  * Fixed `TypeError` on keyboard/mouse events (`SENSITIVITY` and keybindings undefined) in `InputSystem.js` by adding default fallback configurations for missing constructor arguments.
