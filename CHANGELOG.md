# Changelog

All notable changes to **browser-fps-p2p** are documented here.

## [Unreleased] / qwen-code branch — 2026-09-27

### Architecture & real-time loop
- Added a reusable fixed-step `GameLoop` with bounded catch-up and a separate render phase.
- Host and client simulation now run at the configured tick rate independently of monitor refresh rate.
- Client prediction is no longer followed by a second physics simulation pass in the same render frame.
- Client prediction advances Rapier exactly once per fixed tick; reconciliation applies corrected kinematic positions immediately.
- Remote crouch/prone state is reconstructed from the transmitted 16-bit input mask.
- Input is sampled once per simulation tick, preventing duplicate/high-refresh input sequences.

### WebRTC & protocol hardening
- Peer connections now have idempotent close/error cleanup and guarded sends.
- Incoming host input is bounded to one pending frame per peer, preventing unbounded queue growth under network pressure.
- Stale/out-of-order input sequences are ignored.
- Client input protocol now uses a `u16` mask, preserving crouch/prone bits, and serializes weapon-slot changes.
- Host snapshots acknowledge each connected client independently rather than using a global maximum sequence.

### Client interpolation & lifecycle
- Remote snapshot interpolation now uses entity-id maps instead of repeated linear searches.
- Remote kinematic physics proxies are synchronized with interpolated render transforms.
- Input, interpolation buffers, game loops, and WebRTC transports are explicitly disposed during session shutdown.

### WebRTC correctness
- Preserved the PeerManager connection-open callback so host-side player entities are created when a DataConnection becomes ready.

### Resource lifecycle & rendering
- Scene shutdown now disposes unique Three.js geometries, materials, textures, renderer lists, and the canvas.
- Rapier world state and collider/entity mappings are explicitly released on shutdown.
- Impact decals are registered per ECS world instead of a module-global array, preventing old matches from retaining scene/entity references.
- Horizon hill geometry/materials are shared across instances to reduce GPU allocations.

### Combat & weapons

### Combat & weapons
- Hitscan from **weapon muzzle** (not eye-only).
- **First-shot accuracy**: ray uses crosshair aim before recoil; bloom only on follow-up shots in a burst.
- **Four weapons**: Pistol (semi), SMG (auto), Shotgun (8 pellets), Rifle (auto) — keys `1`–`4`.
- Per-weapon **procedural viewmodels**, fire rates, recoil, spread, and **SFX profiles**.
- Magazine + reserve ammo; reload pulls from reserve; HUD shows `mag / reserve`.
- Permanent **bullet-hole decals** oriented to **surface normals** (Rapier `castRayAndGetNormal`), max **100** in scene.
- Tracers + impact flash; host-authoritative damage.

### Movement & stance
- Camera-relative FPS movement (W/A/S/D aligned with look).
- **Crouch** (`C`) and **Prone** (`Z`) with speed multipliers; camera eye height changes; no jump while prone.
- Movement **sway / bob** scales with speed and feeds **weapon sway** and **accuracy penalty** while running.
- Invisible **boundary walls** prevent falling off the map.

### World & graphics
- Sunny outdoor arena: grass, paths, crates, barriers.
- **Trees, cars, mountains** grounded on floor (`y = 0` top) with physics colliders for hits.
- Blue sky, warm sun, soft shadows, hemisphere lighting.

### Audio
- Procedural Web Audio: shoot (per weapon), empty click, reload, footsteps (stance-aware), jump, land, impact, hit, death.

### HUD
- Health, ammo, fire mode, weapon name, slot bar, reload status.
- **Controls hints** panel (WASD, fire, reload, 1–4, C, Z, Space).

### Netcode / architecture (earlier on branch)
- Miniplex ECS host/client loops; PeerJS WebRTC.
- Client prediction, reconciliation, interpolation.
- Binary protocol snapshots/inputs; numeric peer IDs for entity match.
- Rapier character controller; fixed physics/Rapier API usage.

### Fixes (selected)
- Camera must be in scene graph so viewmodel renders.
- Ammo HUD no longer shows mag/mag on reload.
- Impact normals flipped to face shooter; polygon offset against z-fighting.
- Prop placement: crates/trees/cars/mountains sit on ground plane.

---

## How to run

```bash
npm install
npm run dev
```

Host a room in one tab; join with the room ID in another.
