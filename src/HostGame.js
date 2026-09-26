// src/HostGame.js

import { GAME_CONFIG } from './config/constants.js';
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
 * Orchestrates the authoritative host server session, running the full ECS pipeline,
 * physics simulation, client connection management, and local render loop.
 */
export class HostGame {
  /**
   * @param {HTMLElement} containerElement - DOM parent element for rendering context.
   */
  constructor(containerElement) {
    this.container = containerElement;
    
    // Core Engine Subsystems
    this.ecsWorld = new World();
    this.physicsWorld = new PhysicsWorld();
    this.sceneManager = new SceneManager(this.container);
    this.peerManager = new PeerManager();
    this.hud = new HUD();

    // Local host player tracking
    this.localPlayerId = 'host-player';
    this.localEntityId = null;

    // Fixed timestep accumulation
    this.lastFrameTime = performance.now();
    this.accumulatedTime = 0;
    this.fixedDeltaTime = 1 / GAME_CONFIG.TICK_RATE;

    // Loop state
    this.isRunning = false;
    this.animationFrameId = null;
  }

  /**
   * Initializes host environment, physics world, P2P network listeners, and ECS entities.
   * 
   * @returns {Promise<string>} Host Room/Peer ID for incoming peer connections.
   */
  async initialize() {
    // 1. Initialize Rapier physics engine WASM
    await this.physicsWorld.init();

    // 2. Instantiate ECS Systems
    this.inputSystem = new InputSystem();
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.healthSystem = new HealthSystem(this.physicsWorld);
    this.renderSystem = new RenderSystem(this.sceneManager.scene, this.sceneManager.camera);
    this.hostNetworkSystem = new HostNetworkSystem(this.peerManager, this.physicsWorld);

    // 3. Setup static environment collision geometry
    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager.scene);

    // 4. Create host's local authoritative player entity
    const spawnPos = { x: 0, y: 3, z: 0 };
    this.localEntityId = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager.scene,
      this.localPlayerId,
      spawnPos,
      true
    );

    // 5. Initialize WebRTC host listener
    const hostRoomId = await this.peerManager.initializeHost();

    // Register incoming P2P peer connection and disconnection callbacks
    this.peerManager.onPeerConnect((peerId) => {
      this._handleClientConnect(peerId);
    });

    this.peerManager.onPeerDisconnect((peerId) => {
      this._handleClientDisconnect(peerId);
    });

    // Display local HUD
    this.hud.setVisible(true);

    return hostRoomId;
  }

  /**
   * Starts the main host execution loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this._gameLoop = this._gameLoop.bind(this);
    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  /**
   * Authoritative fixed timestep game loop processing physics, network sync, and rendering.
   * @private
   */
  _gameLoop(currentTime) {
    if (!this.isRunning) return;

    const frameDelta = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    // Clamp frame delta to prevent spiral of death after tab switches
    this.accumulatedTime += Math.min(frameDelta, 0.25);

    // Process local host inputs
    this.inputSystem.update(this.ecsWorld, this.localEntityId);

    // Fixed physics simulation step loop
    while (this.accumulatedTime >= this.fixedDeltaTime) {
      // Process physics controllers and dynamic rigidbodies
      this.physicsSystem.update(this.ecsWorld, this.fixedDeltaTime);
      this.healthSystem.update(this.ecsWorld);

      this.accumulatedTime -= this.fixedDeltaTime;
    }

    // Broadcast authoritative world snapshot over WebRTC at network rate
    this.hostNetworkSystem.update(this.ecsWorld, currentTime);

    // Sync visual meshes with ECS state & render camera scene
    this.renderSystem.update(this.ecsWorld, this.localEntityId);
    this.sceneManager.render();

    // Synchronize local HUD elements
    this._updateHUD();

    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  /**
   * Spawns remote client player entity upon WebRTC peer connection.
   * @private
   */
  _handleClientConnect(peerId) {
    const spawnIndex = this.peerManager.connections.size;
    const spawnPos = {
      x: (spawnIndex % 2 === 0 ? 1 : -1) * 4,
      y: 3,
      z: Math.floor(spawnIndex / 2) * 4,
    };

    createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager.scene,
      peerId,
      spawnPos,
      false
    );
  }

  /**
   * Removes player entity upon client disconnect.
   * @private
   */
  _handleClientDisconnect(peerId) {
    const players = this.ecsWorld.with('player');
    for (const entity of players) {
      if (entity.player && entity.player.id === peerId) {
        // Clean up physics body and collider
        if (entity.physics) {
          if (entity.physics.collider) this.physicsWorld.world.removeCollider(entity.physics.collider, true);
          if (entity.physics.rigidBody) this.physicsWorld.world.removeRigidBody(entity.physics.rigidBody);
        }
        // Clean up mesh mesh
        if (entity.renderMesh && entity.renderMesh.mesh) {
          this.sceneManager.scene.remove(entity.renderMesh.mesh);
        }
        // Destroy ECS entity
        this.ecsWorld.remove(entity);
        break;
      }
    }
  }

  /**
   * Updates host HUD with current local player stats.
   * @private
   */
  _updateHUD() {
    if (this.localEntityId === null) return;

    const playerComp = this.ecsWorld.getComponent(this.localEntityId, 'Player');
    const weaponComp = this.ecsWorld.getComponent(this.localEntityId, 'Weapon');

    if (playerComp) {
      this.hud.updateHealth(playerComp.health, playerComp.maxHealth);
      this.hud.setDeathOverlay(playerComp.isDead);
    }

    if (weaponComp) {
      this.hud.updateAmmo(weaponComp.ammo, weaponComp.maxAmmo);
    }
  }

  /**
   * Stops the game loop and disposes all allocated subsystems.
   */
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