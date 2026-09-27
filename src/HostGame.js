import { GAME_CONFIG, NETWORK_CONFIG, STANCE } from './config/constants.js';
import { World } from 'miniplex';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { PeerManager } from './network/PeerManager.js';
import { SceneManager } from './render/SceneManager.js';
import { HUD } from './ui/HUD.js';
import { createPlayer } from './ecs/entities/createPlayer.js';
import { createMap } from './ecs/entities/createMap.js';
import { InputSystem } from './ecs/systems/InputSystem.js';
import { PhysicsSystem } from './ecs/systems/PhysicsSystem.js';
import { HealthSystem } from './ecs/systems/HealthSystem.js';
import { WeaponSystem } from './ecs/systems/WeaponSystem.js';
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { HostNetworkSystem } from './ecs/systems/network/HostNetworkSystem.js';
import { GameLoop } from './core/GameLoop.js';
import { audio } from './audio/AudioManager.js';

export class HostGame {
  constructor(containerElement) {
    this.container = containerElement;
    this.ecsWorld = new World();
    this.physicsWorld = new PhysicsWorld();
    this.sceneManager = new SceneManager(this.container);
    this.peerManager = new PeerManager();
    this.hud = new HUD();

    this.localPlayerId = 'host-player';
    this.localEntity = null;
    this.isRunning = false;

    this.fixedDeltaTime =
      1 / (NETWORK_CONFIG.SERVER_TICK_RATE || GAME_CONFIG.TICK_RATE || 60);

    this._audioUnlockHandler = () => audio.unlock();
    window.addEventListener('click', this._audioUnlockHandler);
  }

  async initialize() {
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.healthSystem = new HealthSystem(this.physicsWorld);
    this.renderSystem = new RenderSystem(this.sceneManager);
    this.weaponSystem = new WeaponSystem(
      this.physicsWorld,
      this.sceneManager,
      this.healthSystem,
      true,
      this.renderSystem
    );
    this.hostNetworkSystem = new HostNetworkSystem(this.peerManager);

    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager);

    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      { x: 0, y: 3, z: 0 },
      true,
      true
    );

    const hostRoomId = await this.peerManager.initHost();
    this.peerManager.onConnect((id) => this._handleClientConnect(id));
    this.peerManager.onDisconnect((id) => this._handleClientDisconnect(id));

    this.hud.setVisible(true);

    this.gameLoop = new GameLoop({
      fixedDeltaTime: this.fixedDeltaTime,
      onFixedUpdate: (dt) => this._fixedUpdate(dt),
      onRender: (dt, now) => this._render(dt, now),
    });

    return hostRoomId;
  }

  _fixedUpdate(dt) {
    if (!this.localEntity) return;

    this.inputSystem.sample(this.ecsWorld, this.localEntity);
    this.hostNetworkSystem.preUpdate(this.ecsWorld);

    this.physicsSystem.update(this.ecsWorld, dt);
    this.weaponSystem.update(this.ecsWorld, performance.now(), dt);
    this.healthSystem.update(this.ecsWorld);
  }

  _render(dt, now) {
    this.hostNetworkSystem.postUpdate(this.ecsWorld, now);
    this.renderSystem.update(this.ecsWorld, this.localEntity, now);
    this.sceneManager.render();
    this._updateHUD();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.gameLoop?.start();
  }

  _handleClientConnect(peerId) {
    const spawnIndex = this.peerManager.connections.size || 1;
    createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      peerId,
      {
        x: (spawnIndex % 2 === 0 ? 1 : -1) * 4,
        y: 3,
        z: Math.floor(spawnIndex / 2) * 4,
      },
      false,
      false
    );
  }

  _handleClientDisconnect(peerId) {
    this.hostNetworkSystem?.removePeer(peerId);

    for (const entity of this.ecsWorld.with('player')) {
      if (entity.player?.peerId !== peerId) continue;
      this._removePlayerEntity(entity);
      break;
    }
  }

  _removePlayerEntity(entity) {
    const physics = entity.physics;
    if (physics?.collider) {
      this.physicsWorld.unregisterCollider?.(physics.collider);
      this.physicsWorld.world?.removeCollider(physics.collider, true);
    }
    if (physics?.rigidBody) {
      this.physicsWorld.world?.removeRigidBody(physics.rigidBody);
    }

    const mesh = entity.renderMesh?.mesh;
    if (mesh) {
      this.sceneManager.scene.remove(mesh);
      mesh.traverse?.((child) => {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    this.ecsWorld.remove(entity);
  }

  _updateHUD() {
    if (!this.localEntity) return;
    const p = this.localEntity.player;
    const w = this.localEntity.weapon;
    const stance = this.localEntity.input?.stance ?? STANCE.STAND;
    const stanceLabel =
      stance === STANCE.CROUCH ? 'CROUCH' :
      stance === STANCE.PRONE ? 'PRONE' : 'STAND';

    if (p) {
      this.hud.updateHealth(p.health, p.maxHealth || 100);
      this.hud.setDeathOverlay(p.isDead);
    }
    if (w) {
      this.hud.updateAmmo(
        w.magazine ?? 0,
        w.reserveAmmo ?? 0,
        !!w.isReloading,
        w.fireMode,
        w.name,
        this.localEntity.loadout?.active ?? 0,
        stanceLabel
      );
    }
  }

  stop() {
    if (!this.isRunning && !this.gameLoop) return;
    this.isRunning = false;
    this.gameLoop?.stop();
    this.inputSystem?.dispose();
    this.renderSystem?.dispose();
    this.hud.dispose();
    this.sceneManager.dispose();
    this.peerManager.destroy();
    window.removeEventListener('click', this._audioUnlockHandler);
    this.gameLoop = null;
  }
}
