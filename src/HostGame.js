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
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { HostNetworkSystem } from './ecs/systems/network/HostNetworkSystem.js';

/**
 * HostGame
 * Orchestrates the authoritative host session: full ECS pipeline, physics,
 * client connection management, and local render loop.
 */
export class HostGame {
  /**
   * @param {HTMLElement} containerElement
   */
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
      1 /
      (NETWORK_CONFIG?.SERVER_TICK_RATE || GAME_CONFIG?.TICK_RATE || 60);

    this.isRunning = false;
    this.animationFrameId = null;
  }

  /**
   * @returns {Promise<string>} Host Room/Peer ID
   */
  async initialize() {
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.healthSystem = new HealthSystem(this.physicsWorld);
    this.renderSystem = new RenderSystem(
      this.sceneManager.scene,
      this.sceneManager.camera
    );
    this.hostNetworkSystem = new HostNetworkSystem(this.peerManager);

    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager);

    const spawnPos = { x: 0, y: 3, z: 0 };
    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      spawnPos,
      true,
      true
    );

    const hostRoomId = await this.peerManager.initHost();

    this.peerManager.onConnect((peerId) => {
      this._handleClientConnect(peerId);
    });

    this.peerManager.onDisconnect((peerId) => {
      this._handleClientDisconnect(peerId);
    });

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
      this.healthSystem.update(this.ecsWorld);
      this.accumulatedTime -= this.fixedDeltaTime;
    }

    this.hostNetworkSystem.update(this.ecsWorld, currentTime);

    this.renderSystem.update(this.ecsWorld, this.localEntity);
    this.sceneManager.render();

    this._updateHUD();

    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  _handleClientConnect(peerId) {
    const spawnIndex = this.peerManager.connections
      ? this.peerManager.connections.size
      : 1;
    const spawnPos = {
      x: (spawnIndex % 2 === 0 ? 1 : -1) * 4,
      y: 3,
      z: Math.floor(spawnIndex / 2) * 4,
    };

    createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      peerId,
      spawnPos,
      false,
      false
    );
  }

  _handleClientDisconnect(peerId) {
    const players = this.ecsWorld.with('player');
    for (const entity of players) {
      if (entity.player && entity.player.peerId === peerId) {
        if (entity.physics) {
          if (entity.physics.collider) {
            this.physicsWorld.world.removeCollider(entity.physics.collider, true);
          }
          if (entity.physics.rigidBody) {
            this.physicsWorld.world.removeRigidBody(entity.physics.rigidBody);
          }
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

    const playerComp = this.localEntity.player;
    const weaponComp = this.localEntity.weapon;

    if (playerComp) {
      this.hud.updateHealth(playerComp.health, playerComp.maxHealth || 100);
      this.hud.setDeathOverlay(playerComp.isDead);
    }

    if (weaponComp) {
      const ammo = weaponComp.ammo ?? weaponComp.currentAmmo ?? 0;
      const maxAmmo = weaponComp.maxAmmo ?? 12;
      this.hud.updateAmmo(ammo, maxAmmo);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.hud.dispose();
    this.sceneManager.dispose();
    this.peerManager.destroy();
  }
}
