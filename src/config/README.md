# Configuration ownership

All gameplay tuning values and protocol limits belong under src/config/.

- gameplay.js — simulation loop safety and global gameplay limits.
- player.js — player movement, stance, health and character pose geometry.
- weapons.js — weapon damage, fire rate, recoil and spread.
- combat.js — hit-zone damage and prediction/reconciliation thresholds.
- camera.js — first-person camera comfort, bob and landing motion.
- physics.js — Rapier geometry, collision groups and controller tuning.
- network.js — tick rates, snapshot/input limits, protocol sizes and invitation codes.
- input.js — input bit flags.
- controls.js — keyboard/mouse bindings and mouse settings.
- world.js — world dimensions, map geometry and object placement.
- objectPlacement.js — deterministic object-placement algorithms and tuning.

## Rule

A value that changes gameplay feel, balance, rendering behavior, network behavior,
physics geometry, protocol layout, or player comfort must be declared here and
named by its domain. Local variables should only represent derived/transient
state; they should not hide tunable constants.

constants.js remains only as a compatibility surface for older imports. New code
should import from config/index.js or the owning domain module.
