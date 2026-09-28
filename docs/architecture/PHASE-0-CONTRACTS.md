# Architecture Overhaul — Phase 0 Contracts

This document defines the boundaries that later phases must preserve while the codebase is migrated incrementally.

## 1. Migration strategy

The overhaul is a controlled migration, not a rewrite.

Each phase must:

1. establish or preserve a behavioral contract;
2. migrate one bounded responsibility;
3. keep the application behaviorally compatible unless the change is explicitly a bug fix;
4. add or update tests for pure logic before moving the implementation;
5. remove compatibility code only after all consumers have migrated.

Do not perform large-scale file moves without a concrete dependency boundary.

## 2. Architectural layers

The target architecture is:

```
Application
├── Simulation
│   ├── ECS state
│   ├── movement
│   ├── combat
│   ├── damage / lifecycle
│   └── simulation events
├── Physics
│   ├── Rapier integration
│   ├── character physics
│   └── physics queries
├── Network
│   ├── transport
│   ├── protocol
│   ├── host authority
│   └── client prediction / reconciliation
└── Presentation
    ├── rendering
    ├── VFX
    └── audio
```

The application layer orchestrates these systems.

## 3. Dependency rules

### Simulation

Simulation code must not depend on:

- Three.js;
- PeerJS / WebRTC transport;
- DOM APIs;
- AudioContext or audio playback;
- renderer objects.

Simulation may emit plain-data events for other layers.

### Presentation

Presentation code may consume simulation state and events, but must not become an authoritative source of gameplay state.

### Network

Network packets contain serializable data only. Runtime objects, Three.js objects, Rapier objects, ECS entities, and callbacks must never cross the protocol boundary.

### Physics

Gameplay systems should access physics through narrow query/command interfaces rather than depending on Rapier APIs throughout the codebase.

### Configuration

Every gameplay constant has one domain owner. Compatibility barrels are transitional and must not become a second source of truth.

## 4. Authority model

The current game model is an authoritative listen-host architecture:

- clients send input / intent;
- the host validates and simulates authoritative gameplay;
- the host owns authoritative damage and hit resolution;
- the host broadcasts authoritative state and gameplay events;
- clients predict local movement where appropriate;
- clients reconcile against acknowledged authoritative state;
- remote players are rendered from interpolated authoritative state.

This is not assumed to be deterministic lockstep simulation.

## 5. Fixed-step simulation contract

Gameplay simulation must have an explicit fixed simulation timestep.

Presentation/rendering may run at a different cadence.

The migration must preserve:

- simulation tick ordering;
- input sequencing;
- fire-rate semantics;
- physics stepping semantics;
- authoritative event ordering.

A render frame must never silently become a simulation tick.

## 6. Network input validation contract

Any client-controlled gameplay input is untrusted data.

At minimum, host-side validation must enforce finite and bounded values for:

- yaw;
- pitch;
- input flags;
- weapon slot;
- sequence numbers.

Malformed packets must be rejected without mutating authoritative state.

## 7. Event contract

Cross-layer events must be plain data.

An event should identify:

- event type;
- source/entity identifier when applicable;
- simulation timestamp/tick when required;
- deterministic seed/sequence when presentation needs reproducibility;
- relevant scalar/vector data.

Events must not contain runtime object references.

## 8. ECS component contract

Separate simulation state from runtime bindings.

### Simulation components

Examples:

- Transform;
- Input;
- Player;
- Weapon;
- Health;
- Movement;
- Network state.

### Runtime bindings

Examples:

- Physics body;
- Render binding;
- Character visual;
- Audio binding.

Runtime bindings are disposable adapters and must not become hidden gameplay state.

## 9. Resource ownership

Every subsystem that creates:

- Three.js geometries/materials/textures;
- event subscriptions;
- timers;
- network handlers;
- physics bodies/colliders;

must have an explicit owner and cleanup path.

## 10. Reconciliation contract

Authoritative correction and local prediction are different simulation times.

The intended model is:

```
authoritative state at ACK tick
    + replay(unacknowledged local inputs)
    = corrected current predicted state
```

A correction must never compare a current post-replay state directly against a historical pre-replay state and treat that difference as a current-position error.

This contract is a high-priority target for Phase 2.

## 11. Remote interpolation contract

Remote state is authoritative but arrives discretely.

Presentation should render remote entities from a small snapshot history at a deliberate interpolation timestamp rather than immediately overwriting their visible transform with the newest packet.

This is a presentation concern and must not mutate authoritative simulation state.

## 12. VFX contract

VFX consumes presentation events/data.

Gameplay systems should describe an impact using plain data such as:

- world position;
- surface normal;
- material;
- impact velocity;
- deterministic seed.

VFX decides how to visualize it.

VFX must not perform gameplay hit detection or damage.

## 13. Phase completion criteria

Phase 0 is complete only when:

- these contracts are documented;
- the project has a runnable test command;
- at least one pure gameplay-adjacent module is covered by deterministic tests;
- no gameplay behavior has been intentionally changed by the phase;
- the branch remains a clean, reviewable migration starting point.

Later phases may tighten these contracts, but must document the change before relying on it.
