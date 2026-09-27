# P2P Browser FPS Arena

A browser-native multiplayer FPS using **WebRTC P2P** (PeerJS), **Rapier3D** physics, **Three.js** rendering, and a **Miniplex ECS** game loop.

## Features

- **Listen-host P2P** — no dedicated game server; host runs the authoritative simulation
- **Hitscan combat** — muzzle-origin rays, first-shot accuracy, progressive bloom on full-auto
- **4 weapons** — Pistol, SMG, Shotgun, Rifle with distinct meshes, rates, SFX, and handling
- **Stances** — stand / crouch / prone with speed and camera height changes
- **Movement sway** — bob and micro-shake affect weapon viewmodel and accuracy while moving
- **World** — sunny outdoor map, trees, cars, mountains, crates; boundary walls; permanent bullet holes (max 100)
- **Netcode** — client prediction, reconciliation, interpolation, binary snapshots
- **Audio** — procedural SFX for fire, reload, footsteps, impacts, etc.

## Tech stack

| Layer | Choice |
|--------|--------|
| ECS | Miniplex |
| Physics | `@dimforge/rapier3d-compat` |
| Graphics | Three.js |
| Network | PeerJS / WebRTC DataChannels |
| Build | Vite |

## Quick start

```bash
git clone https://github.com/AminBrave/browser-fps-p2p.git
cd browser-fps-p2p
git checkout qwen-code   # active development branch
npm install
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`).

### Play

1. **Host** — click Host, copy Room ID  
2. **Client** — second tab/window, paste ID, Join  
3. Click the canvas for pointer lock  

### Controls

| Input | Action |
|--------|--------|
| WASD | Move |
| Mouse | Look |
| LMB | Fire |
| R | Reload |
| 1–4 | Pistol / SMG / Shotgun / Rifle |
| C | Toggle crouch |
| Z | Toggle prone |
| Space | Jump (not while prone) |

## Project layout (high level)

```text
src/
  config/          constants, keybindings
  audio/           procedural SFX
  ecs/
    components/    Transform, Physics, Player, Weapon, Input
    entities/      createPlayer, createMap, createBullet
    systems/       Input, Physics, Weapon, Health, Render, network/*
  network/         PeerManager, Protocol, PacketTypes
  physics/         PhysicsWorld (Rapier + hitscan normals)
  render/          SceneManager, WeaponViewModel
  ui/              HUD, LobbyUI
  HostGame.js / ClientGame.js / index.js
```

See **CHANGELOG.md** for a full history of gameplay and systems work on this branch.

## Architecture notes

- **Simulation is fixed-step** at the configured server/client tick rate; rendering runs independently. This prevents high-refresh displays from advancing gameplay faster and bounds catch-up after tab suspension.
- **Input is sampled once per simulation tick**, not once per render frame.
- **WebRTC lifecycle is explicit**: connection errors/close are idempotent, unsupported payloads are ignored, sends are guarded, and shutdown clears transports/callbacks.
- **Binary input uses a 16-bit input mask** so crouch/prone flags are transmitted correctly. Weapon-slot selection is also serialized.
- **Host acknowledgements are per client**, avoiding one player's input sequence from acknowledging another player's prediction buffer.
- **Remote interpolation uses indexed snapshots** and keeps remote physics proxies aligned with rendered positions.
- **Resource ownership is session-scoped**: Three.js scene resources, Rapier state, and impact decals are released when a match stops.
- **World object transforms use a ground-origin convention**: ECS render roots are placed at GROUND_Y; visible geometry is offset upward locally, while Rapier colliders use the same configured dimensions and world offsets. This prevents floating trees/cars and invisible colliders.
- **Every solid prop is declarative**: crate, tree, car, barrier, mountain and boundary dimensions/placements live together in src/config/world.js; visual geometry and collision geometry are derived from those definitions.
- **Every world solid uses one physical-object model**: each object has one Rapier rigid body; composite assets use multiple child colliders on that same body, while single-shape assets are one-part compounds. Trees are trunk + canopy compounds, and cars are body + cabin + four wheel compounds. All child colliders map back to the same ECS entity for player collision and hitscan impacts.


- **Host** simulates physics, weapons, and damage; broadcasts world snapshots.
- **Clients** predict movement, play local weapon FX, and reconcile against host state.
- Hitscan uses Rapier `castRayAndGetNormal` when available so decals lie on the correct face.

## Limitations

- Host disconnect ends the match for everyone.
- Decals are local (not fully shared as world state over the network).
- NAT/firewall may block some WebRTC peers without a TURN server.

## License

MIT — see `LICENSE` if present.

## World and object conventions

The world geometry is centralized in `src/config/world.js`. It is the single source of truth for:

- Ground height, island dimensions, boundary walls, object padding and the safety floor.
- Player spawn points and grounded player placement.
- Crate, tree, car, barrier, path and mountain dimensions and layouts.
- Shared object placement rules that clamp world objects inside the playable island.
- Object definitions also contain their collision dimensions and visual offsets; there are no separate per-factory size/position constants for trees and cars. Cars use a compound collider made from the same body, cabin and wheel dimensions as the visible model.

Rendering and Rapier physics consume the same dimensions. Ground objects are created with solid static colliders, and composite objects use the same local offsets and rotations as their rendered parts. Rapier 0.11.x does not expose `ColliderDesc.compound()`, so compound assets are implemented as multiple colliders attached to one fixed rigid body; this preserves a single physical object while remaining compatible with the pinned dependency. An invisible safety floor provides a final containment layer below the playable ground.

To modify map scale or object placement, edit `src/config/world.js` rather than changing geometry literals in entity factories.
