# Changelog

All notable changes to this project will be documented in this file.

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