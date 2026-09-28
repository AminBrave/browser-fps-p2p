# Phase 3 — Physics Boundaries

## Goal

Reduce the responsibility of `PhysicsWorld` without changing Rapier behavior or the public API used by gameplay systems.

## Completed slice

### ColliderRegistry

`src/physics/ColliderRegistry.js` owns collider-to-gameplay metadata:

- entity
- render target
- hit zone
- projectile material

It also owns the rule that a player movement collider is not a bullet hit target.

### PhysicsQueries

`src/physics/PhysicsQueries.js` owns Rapier ray queries:

- generic ray casts
- projectile exit queries
- conversion from Rapier hits into plain gameplay hit data

The query layer receives the world through a getter so it does not own world lifetime.

### PhysicsWorld compatibility façade

`PhysicsWorld` still owns:

- Rapier world initialization/lifetime
- stepping
- body/collider creation
- character hitbox updates
- spawn validation
- static world construction

Existing methods such as `castRay()`, `getProjectileExitHit()`, and collider registration remain available and delegate to the new boundaries.

## Why this slice first

This separates two high-churn concerns without changing character-controller behavior. A larger extraction of character physics is deliberately deferred until the current API usage is mapped and covered by behavior tests.

## Rules for the next slice

1. Keep Rapier-specific objects inside `src/physics/`.
2. Return plain data from query APIs.
3. Do not let render objects become required physics state.
4. Keep character movement behavior unchanged while extracting it.
5. Prefer one small abstraction over a hierarchy of physics services.
6. Add tests around extracted behavior before changing callers.

## Known limitation

`PhysicsWorld` still contains character construction, static-body construction, spawn validation, and world lifecycle. Phase 3 is therefore intentionally incomplete after this first boundary extraction.


## Phase 4 — Combat boundary

`BallisticsTracer` owns projectile trajectory/penetration and receives physics queries through dependency injection. `CombatResolver` converts an authoritative player hit into a plain damage command using the pure damage model. `WeaponSystem` remains the orchestration layer for weapon state, presentation, shot events, and applying the resulting command through `HealthSystem`.

The next migration target is to reduce `WeaponSystem`'s presentation responsibilities further; gameplay combat logic should remain independent of Three.js and audio.


## Phase 5 — Health simulation boundary

Health rules now live in `src/game/simulation/combat/HealthModel.js`. Damage application and regeneration calculations are pure functions; `HealthSystem` remains the ECS orchestration layer for death bookkeeping, kills, respawn, physics resets, impact-mark presentation, audio, and events.

This preserves existing behavior while creating a testable simulation boundary. The next presentation-heavy combat target is weapon presentation/state coupling, not another large subsystem rewrite.


## Phase 6 — Weapon state boundary

Weapon fire/reload decisions now live in src/game/simulation/combat/WeaponStateModel.js. The pure model owns cooldown checks, semi/automatic fire decisions, reload eligibility, and ammunition transfer calculations. WeaponSystem remains the ECS orchestration layer for input consumption, weapon switching, ballistics, damage application, rendering, audio, VFX, and network events.

This intentionally extracts rules rather than creating a second weapon system. Presentation and shot orchestration remain the next coupling to reduce.
