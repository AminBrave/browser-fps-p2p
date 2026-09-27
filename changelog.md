## [Unreleased] / qwen-code — 2026-09-27

### World geometry, normalization and containment

### Rendering and physics alignment

### Vehicle impact rendering and compound hit mapping

- Fixed decal orientation construction to use a Three.js quaternion before converting to Euler; `Euler.setFromUnitVectors()` does not exist and could halt the simulation on the first impact.

- Fixed a combat runtime crash where the impact-decal path referenced the raycast result outside its block; the exact `renderTarget` is now captured with the hit and passed safely to decal creation.

- Fixed car bullet-impact artifacts by mapping every compound collider back to its exact visible mesh part (body, cabin or wheel).
- Replaced the generic floating impact plane with clipped Three.js `DecalGeometry` when a render target is known, preventing decals from spilling across car edges or adjacent parts.
- Stabilized decal depth handling with a small surface-normal offset, depth testing and conservative polygon offset instead of the previous aggressive bias.

### Compound world physics

- Fixed the Rapier 0.11.x startup failure caused by calling the unavailable `ColliderDesc.compound()` API.
- Implemented compound world objects using one fixed Rapier rigid body with multiple child colliders, which is the supported equivalent in this Rapier version.
- Converted trees to one compound body containing the trunk cylinder and every canopy cone; converted cars to one compound body containing the body, cabin and four correctly rotated wheel cylinders.
- Refactored single-shape crates, barriers, mountains, boundaries and ground through the same compound-body factory as one-part compounds, keeping one physical-object model across the map.
- Registered every child collider back to its owning ECS object so bullet raycasts and player collision resolve to the same world entity.

### Car physical model alignment

- Replaced the car's single oversized cuboid collider with a compound Rapier collider containing the rendered body, cabin and four wheel volumes.
- Kept the complete car collision shape under one fixed rigid body so the entire physical asset rotates exactly with the rendered car.
- Matched wheel collider orientation to the rendered wheel orientation and kept all collider offsets in the same local ground-root coordinate system.
- Registered the compound collider as one car entity so player collision, raycast hits and bullet impact decals resolve to the actual car object rather than an unrelated invisible volume.


- Fixed normalized box objects disappearing while their Rapier colliders remained active by restoring scene attachment through the shared object factory.
- Standardized every solid world-object ECS transform to a ground-level root (GROUND_Y), with visible meshes offset locally by their configured dimensions.
- Fixed trees so trunk/canopy visuals and solid Rapier cylinder/cone colliders share the same radii, heights and local Y offsets.
- Fixed cars so body, cabin, wheels and the solid collider share one ground-origin definition; corrected the collider height/center to cover the visible vehicle instead of leaving an invisible collision volume on the ground.
- Converted tree and mountain rendering to local geometry offsets so RenderSystem updates cannot move their visuals away from their colliders.
- Consolidated crate, tree, car, barrier and mountain placements into declarative entries in src/config/world.js.
- Added a deterministic RenderSystem invariant that keeps non-boundary solid world objects visible while preserving invisible boundary walls.
- Added native Rapier cylinder colliders for tree trunks; cone colliders remain aligned with the rendered canopy and mountains.


- Added `src/config/world.js` as the single source of truth for ground height, island bounds, boundary dimensions, object sizes, object positions and player spawn points.
- Normalized world-object placement through shared ground and island-boundary calculations so objects remain inside the playable area and rest on the configured ground plane.
- Centralized player spawn height from configured player dimensions instead of hard-coded world Y positions.
- Made floor, crates, trees, cars, barriers, mountains and boundary walls use solid static Rapier colliders; collider-to-entity registration now covers map objects for raycast/impact ownership.
- Replaced the stepped mountain collider approximation with a native Rapier cone collider aligned to the rendered mountain volume, so players and bullets interact with the same solid shape.
- Added an invisible safety floor below the island as a last-resort containment layer.
- Fixed rotated car colliders so their physics orientation matches their rendered orientation.
- Removed duplicated map-size constants from the general game config.

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
