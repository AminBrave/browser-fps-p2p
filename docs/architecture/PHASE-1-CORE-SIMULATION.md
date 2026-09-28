# Architecture Overhaul — Phase 1 Core Simulation

Phase 1 establishes the first executable simulation boundary.

## Migrated pure modules

### Movement

`src/game/simulation/movement/FpsMovement.js`

Owns:

- directional input normalization;
- yaw-relative movement vectors;
- sprint/stance speed selection;
- jump eligibility;
- vertical gravity integration;
- horizontal movement intensity.

It has no ECS, Rapier, Three.js, network, DOM, or audio dependency.

`src/utils/Movement.js` remains as a compatibility adapter for existing callers.

### Shot direction

`src/game/simulation/combat/ShotDirection.js`

Owns:

- aim yaw/pitch to normalized direction conversion;
- circular spread sampling;
- RNG consumption.

The RNG is injectable. Existing `WeaponSystem` calls continue to use `Math.random`, so this phase does not change shot randomness or weapon feel.

## Phase 1 boundary

The target dependency direction is:

```
config / input data
       ↓
pure simulation functions
       ↓
ECS systems / physics / network adapters
       ↓
presentation
```

Pure simulation modules must not import:

- Three.js;
- Rapier;
- PeerJS;
- DOM APIs;
- audio systems;
- ECS world instances.

They may accept plain data and configuration as arguments.

## Compatibility rule

Existing callers are not required to migrate immediately.

A legacy utility may temporarily adapt domain configuration and call the pure module. This lets later phases migrate callers independently and makes rollback straightforward.

## Verification

Phase 1 includes deterministic tests for:

- diagonal normalization;
- yaw-relative movement;
- sprint and stance rules;
- jump and gravity;
- movement intensity;
- shot direction normalization;
- spread determinism with injected RNG;
- RNG consumption behavior.

## Remaining Phase 1 work

The following remain intentionally outside this first migration slice:

- ballistic trace / Rapier query separation;
- damage calculation separation;
- ECS component/runtime-binding separation;
- simulation event bus;
- full fixed-timestep orchestration.

Those require more caller analysis and will be migrated in separate commits rather than bundled into one risky change.
