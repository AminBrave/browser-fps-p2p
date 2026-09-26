// src/HostGame.js

import { GAME_CONFIG, NETWORK_CONFIG } from './config/constants.js';
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

    this.lastFrameTime = performance.now();
    this.accumulatedTime = 0;
    this.fixedDeltaTime =
      1 / (NETWORK_CONFIG?.SERVER_TICK_RATE || GAME_CONFIG?.TICK_RATE || 60);

    this.isRunning = false;
    this.animationFrameId = null;

    const unlock = () => {
      audio.unlock();
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('click', unlock);
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
    return hostRoomId;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this._gameLoop = this._gameLoop.bind(this);
    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  _gameLoop(currentTime) {
    if (!this.isRunning) return;

    const frameDelta = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;
    this.accumulatedTime += Math.min(frameDelta, 0.25);

    if (this.localEntity) {
      this.inputSystem.update(this.ecsWorld, this.localEntity);
    }

    while (this.accumulatedTime >= this.fixedDeltaTime) {
      this.physicsSystem.update(this.ecsWorld, this.fixedDeltaTime);
      this.weaponSystem.update(
        this.ecsWorld,
        performance.now(),
        this.fixedDeltaTime
      );
      this.healthSystem.update(this.ecsWorld);
      this.accumulatedTime -= this.fixedDeltaTime;
    }

    this.hostNetworkSystem.update(this.ecsWorld, currentTime);
    this.renderSystem.update(this.ecsWorld, this.localEntity, currentTime);
    this.sceneManager.render();
    this._updateHUD();

    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  _handleClientConnect(peerId) {
    const spawnIndex = this.peerManager.connections?.size || 1;
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
    for (const entity of this.ecsWorld.with('player')) {
      if (entity.player?.peerId === peerId) {
        if (entity.physics?.collider) {
          this.physicsWorld.unregisterCollider?.(entity.physics.collider);
          this.physicsWorld.world.removeCollider(entity.physics.collider, true);
        }
        if (entity.physics?.rigidBody) {
          this.physicsWorld.world.removeRigidBody(entity.physics.rigidBody);
        }
        if (entity.renderMesh?.mesh) {
          this.sceneManager.scene.remove(entity.renderMesh.mesh);
        }
        this.ecsWorld.remove(entity);
        break;
      }
    }
  }

  _updateHUD() {
    if (!this.localEntity) return;
    const p = this.localEntity.player;
    const w = this.localEntity.weapon;
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
        this.localEntity.loadout?.active ?? 0
      );
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.renderSystem?.dispose();
    this.hud.dispose();
    this.sceneManager.dispose();
    this.peerManager.destroy();
  }
}
