# Changelog

All notable, high-impact changes to **browser-fps-p2p** are documented here.

This changelog intentionally excludes routine formatting, duplicated commits, test-only maintenance, and small implementation churn. Entries are grouped by the user-visible or architectural value of the work.

## Versioning

The project started this development line at **1.0.0**. The branch now reaches **2.0.0** under Semantic Versioning.

- **MAJOR** — breaking architecture, simulation, protocol, or public internal contracts that require coordinated code changes.
- **MINOR** — backward-compatible gameplay, rendering, networking, physics, or infrastructure capabilities.
- **PATCH** — backward-compatible bug fixes, stability fixes, tuning, and correctness corrections.
- When many commits form one architectural migration, they are counted as one release-level change rather than artificially inflating the version for every commit.

### Current version: 2.0.0

The move to **2.0.0** is driven by the architecture overhaul: simulation rules were extracted behind pure boundaries, networking and physics contracts were formalized, rendering/presentation ownership was separated from ECS simulation, and several internal APIs changed. These are coordinated breaking changes even though the game remains the same product.

---

## [2.0.0] — Architecture Overhaul

### Architecture & simulation boundaries — MAJOR

- Reorganized the game around explicit **simulation, networking, physics, ECS composition, and presentation boundaries**.
- Extracted pure simulation models for movement, weapon state, shot direction, combat damage, health, ballistic tracing, impact seeds, snapshot interpolation, and reconciliation math.
- Moved rendering responsibilities out of ECS simulation and into dedicated presentation modules.
- Removed ECS dependencies from pure combat/event models so core rules can be tested without Three.js, DOM, or a running game.
- Moved map, player, and urban-object composition behind dedicated boundaries instead of mixing world construction with ECS internals.
- Made weapon dependencies explicit and routed weapon presentation through an adapter/event boundary.
- Introduced presentation-owned transient effects and impact lifecycle management, keeping visual effects out of simulation ownership.
- Added architecture boundary tests to prevent accidental re-coupling between ECS, physics, simulation, and rendering.

### Fixed-step simulation & movement — MAJOR

- Added a reusable fixed-step game loop with bounded catch-up and an independent render phase.
- Made host and client simulation advance at the configured tick rate rather than at display refresh frequency.
- Ensured client prediction advances physics once per fixed tick.
- Formalized movement input flags and the FPS movement API, including sprint, crouch, prone, jump, gravity, and stance speed modifiers.
- Added deterministic movement tests and regression coverage for prediction-facing movement integration.

### Authoritative networking & protocol hardening — MAJOR

- Established explicit networking boundaries around PeerJS/WebRTC transport, game protocol, host authority, prediction, reconciliation, and interpolation.
- Added binary packet boundary validation and rejection of trailing/invalid payload bytes.
- Added authoritative client-input validation and bounded pending input queues.
- Rejected stale/out-of-order input sequences.
- Changed client input encoding to a 16-bit mask so stance and movement flags survive transport.
- Serialized weapon-slot changes through the input protocol.
- Made host acknowledgements per-client instead of relying on a global maximum sequence.
- Added transport lifecycle boundaries with guarded sends, idempotent close/error handling, explicit peer closure, and connection-error propagation.
- Preserved the transport connection-open lifecycle required for host-side player creation.
- Added snapshot interpolation and reconciliation as pure, deterministic models.
- Added regression tests for protocol security, network models, host networking, prediction/reconciliation, and transport behavior.

### Ballistics & combat — MINOR / high-impact feature set

- Added a dedicated ballistic tracer with distance-aware projectile behavior.
- Added ballistic drop and distance-based damage falloff.
- Added per-weapon ballistic tuning, projectile drag, penetration resistance, residual penetration damage loss, and surface-material interaction.
- Added explicit projectile material metadata to physics colliders and propagated material identity through ray hits.
- Added material-aware penetration and exact Rapier geometry-based projectile thickness/exit-distance handling.
- Made ballistic energy drive damage and replicated authoritative entry/exit impact surfaces.
- Corrected penetration exit normals and replicated them for client impact decals.
- Hardened impact deduplication and stopped fabricating invalid grazing-angle exit holes.
- Aligned bullet traces to the **weapon muzzle** while aiming toward the crosshair target rather than tracing only from the camera.
- Added deterministic shot-direction/impact-seed behavior suitable for host/client agreement.

### Weapons, accuracy & aiming — MINOR

- Built a shared accuracy model used by shot dispersion and the crosshair.
- Added stance, movement, sprint, and ADS accuracy effects.
- Added weapon-specific ADS poses and synchronized the firing muzzle with the rendered ADS weapon pose.
- Added configurable crosshair presentation driven by live weapon accuracy.
- Added weapon-specific fire/reload presentation events and routed them through the presentation boundary.
- Added local-only weapon presentation behavior so visual/audio feedback does not leak into authoritative simulation.

### Impact, materials & VFX — MINOR / high-impact rendering work

- Added deterministic, material-specific bullet impact reactions.
- Added material-aware impact particles and animated impact sparks with drag, gravity, staggered fading, and configured render budgets.
- Routed weapon surface hits through the centralized ImpactSystem.
- Separated persistent decals from transient particle/tracer lifecycles.
- Corrected impact normals for transformed and non-uniformly scaled meshes.
- Stabilized bullet decals against depth fighting with surface offsets, depth testing, and conservative polygon offset.
- Mapped compound-collider hits back to the exact visible car part.
- Replaced generic floating car impact planes with clipped Three.js decals where a render target is available.
- Fixed impact particle double-transform offsets and simplified impact-particle integration.
- Added stable player-ID ownership for player impact visuals and cleanup.

### World & physics — MINOR / high-impact correctness

- Added `src/config/world.js` as the declarative source of truth for ground height, island bounds, object dimensions, placements, boundaries, and player spawn positions.
- Normalized solid world objects around a shared ground-origin convention.
- Reworked trees, cars, crates, barriers, mountains, paths, ground, and boundary geometry so rendered dimensions and physics dimensions derive from the same definitions.
- Replaced the unsupported Rapier `ColliderDesc.compound()` path with the supported model: multiple child colliders attached to one fixed rigid body.
- Converted trees and cars to compound physical objects while retaining a single owning entity.
- Added collider-to-entity registration so physics, raycasts, impacts, and presentation resolve to the same world object.
- Added native cone/cylinder geometry for relevant world colliders.
- Added a physics-aware safety floor and validated spawn locations against actual physics.
- Added randomized respawns constrained by physics-safe validation.
- Corrected rendered/physics alignment for rotated cars and other compound assets.
- Kept Rapier implementation behind physics boundaries rather than exposing it throughout world/ECS code.

### Player health & impact state — MINOR

- Extracted pure health and damage rules from presentation concerns.
- Added gradual health regeneration with configurable tuning.
- Tracked player impact marks as gameplay state for proportional cleanup during healing.
- Synchronized client player-impact presentation with authoritative health.
- Cleared impact state correctly on full health and respawn.
- Made player impact ownership stable across host and clients.

### Camera, stance & movement presentation — MINOR

- Added stance-aware camera motion driven by movement speed and acceleration.
- Added smooth layered running motion and camera shake.
- Added stance-specific weapon sway and prone crawl motion.
- Made weapon/viewmodel motion follow stance and movement state without coupling those visual effects to simulation ownership.

### Resource lifecycle & session cleanup — PATCH / stability

- Added explicit disposal of Three.js geometries, materials, textures, renderer resources, scenes, and weapon scenes.
- Made shared-material disposal safe by avoiding duplicate disposal.
- Added explicit Rapier/world/collider mapping cleanup on session shutdown.
- Made presentation collider bindings and transient effects session-scoped.
- Reduced cross-match retention of ECS entities and scene references.
- Shared static render resources where appropriate to reduce unnecessary GPU allocations.

### Testing & engineering infrastructure — MINOR

- Consolidated the project onto one `test/` suite and removed the superseded legacy `tests/` suite.
- Added deterministic Node-based tests covering simulation, combat, networking, physics boundaries, configuration/components, utilities, presentation boundaries, and architecture boundaries.
- Added network protocol/security regression coverage.
- Added tests for transport delegation and lifecycle behavior.
- Added integration tests for determinism and separation between world definitions, ECS, physics, and presentation.
- Added `npm run test:coverage` and `npm run test:watch`.
- Added GitHub Actions unit-test/coverage workflow for the `architecture-overhaul` branch.
- Added `docs/TESTING.md` documenting deterministic testing and regression-test practices.

### Documentation & operational hardening — PATCH

- Documented the networking stack, signaling/ICE/TURN responsibilities, production configuration, and transport/game-handshake boundary.
- Removed reliance on hard-coded public TURN credentials in source and documented runtime ICE configuration.
- Added architecture phase documents covering simulation, networking, physics boundaries, and contracts.
- Corrected README and project documentation to reflect the architecture-overhaul branch and current systems.

---

## Release assessment

### Why 2.0.0 instead of 1.x

The branch contains several changes that alter internal contracts rather than merely adding optional functionality:

1. Simulation APIs were extracted and changed to explicit dependency/configuration boundaries.
2. ECS ownership was separated from rendering and presentation.
3. Network transport and protocol responsibilities were formalized and hardened.
4. Physics and world composition were moved behind explicit boundaries.
5. Prediction, reconciliation, interpolation, and ballistic rules became independently testable models.

Those changes collectively represent a **major architecture release**, so the appropriate SemVer endpoint is **2.0.0**.

### Not counted individually

The following were intentionally not promoted into separate changelog entries or version bumps:

- formatting/style-only commits;
- repeated commits implementing the same refactor in stages;
- test expectation/regex-only adjustments;
- duplicated legacy-test deletion commits;
- small tuning changes that do not introduce a new capability;
- intermediate commits superseded by later fixes.

This keeps the changelog focused on the durable value of the branch rather than commit volume.
