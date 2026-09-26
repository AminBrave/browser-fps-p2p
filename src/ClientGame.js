// src/ClientGame.js

import { GAME_CONFIG } from './config/constants.js';
import { World } from 'miniplex';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { PeerManager } from './network/PeerManager.js';
import { SceneManager } from './render/SceneManager.js';
import { HUD } from './ui/HUD.js';
import { Protocol } from './network/Protocol.js';
import { PACKET_TYPES } from './network/PacketTypes.js';
import { createPlayer } from './ecs/entities/createPlayer.js';
import { createMap } from './ecs/entities/createMap.js';
import { InputSystem } from './ecs/systems/InputSystem.js';
import { PhysicsSystem } from './ecs/systems/PhysicsSystem.js';
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { ClientPredictSystem } from './ecs/systems/network/ClientPredictSystem.js';
import { ClientReconcileSystem } from './ecs/systems/network/ClientReconcileSystem.js';
import { InterpolationSystem } from './ecs/systems/network/InterpolationSystem.js';
import { CircularBuffer } from './utils/CircularBuffer.js';

/**
 * ClientGame
 * Orchestrates the client session, executing local input prediction, state reconciliation
 * against authoritative host snapshots, entity interpolation for remote players, and local rendering.
 */
export class ClientGame {
  /**
   * @param {HTMLElement} containerElement - Parent DOM element for WebGL scene.
   */
  constructor(containerElement) {
    this.container = containerElement;

    // Core Subsystems
    this.ecsWorld = new World();
    this.physicsWorld = new PhysicsWorld();
    this.sceneManager = new SceneManager(this.container);
    this.peerManager = new PeerManager();
    this.hud = new HUD();

    // Client tracking
    this.localPlayerId = null;
    this.localEntity = null;
    this.playerEntities = [];

    // Netcode prediction history buffer
    this.pendingInputBuffer = new CircularBuffer(128);

    // Fixed timestep control
    this.lastFrameTime = performance.now();
    this.accumulatedTime = 0;
    this.fixedDeltaTime = 1 / GAME_CONFIG.TICK_RATE;

    // Execution loop control
    this.isRunning = false;
    this.animationFrameId = null;
  }

  /**
   * Initializes local client, connects to WebRTC host peer, and sets up network handlers.
   * 
   * @param {string} hostRoomId - Peer ID of the Host session.
   * @returns {Promise<void>}
   */
  async initialize(hostRoomId) {
    // 1. Initialize client-side prediction physics world WASM
    await this.physicsWorld.init();

    // 2. Instantiate ECS Systems
    this.inputSystem = new InputSystem(this.container);
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.renderSystem = new RenderSystem(this.sceneManager.scene, this.sceneManager.camera);
    
    this.predictSystem = new ClientPredictSystem(this.physicsWorld, this.pendingInputBuffer);
    this.reconcileSystem = new ClientReconcileSystem(this.physicsWorld, this.pendingInputBuffer);
    this.interpolationSystem = new InterpolationSystem();

    // 3. Setup static environment geometry
    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager.scene);

    // 4. Connect WebRTC P2P to Host
    this.localPlayerId = await this.peerManager.initializeClient(hostRoomId);

    // Register network packet listeners
    this.peerManager.onData((data) => {
      this._handleServerPacket(data);
    });

    // Spawn local player prediction entity
    const spawnPos = { x: 0, y: 3, z: 0 };
    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager.scene,
      this.localPlayerId,
      spawnPos,
      true
    );
    this.playerEntities.push(this.localEntity);

    // Display client HUD
    this.hud.setVisible(true);
  }

  /**
   * Starts the client execution and rendering loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this._gameLoop = this._gameLoop.bind(this);
    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  /**
   * Client loop performing local input sampling, client prediction, WebRTC transmission,
   * interpolation of remote entities, and scene rendering.
   * @private
   */
  _gameLoop(currentTime) {
    if (!this.isRunning) return;

    const frameDelta = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    this.accumulatedTime += Math.min(frameDelta, 0.25);

    // 1. Process inputs and sample payload
    const inputPayload = this.inputSystem.update(this.ecsWorld, this.localEntity);

    if (inputPayload && this.localEntity) {
      inputPayload.deltaTime = this.fixedDeltaTime;

      // Predict local movement step on physics body
      if (typeof this.predictSystem.update === 'function') {
        this.predictSystem.update(this.ecsWorld, this.localEntity, this.fixedDeltaTime);
      }

      // Transmit input payload to Host over WebRTC DataChannel
      const encodedInput = Protocol.encodeInput(inputPayload);
      if (typeof this.peerManager.sendToHost === 'function') {
        this.peerManager.sendToHost(encodedInput);
      }
    }

    // Fixed timestep step for client prediction engine physics
    while (this.accumulatedTime >= this.fixedDeltaTime) {
      this.physicsSystem.update(this.ecsWorld, this.fixedDeltaTime);
      this.accumulatedTime -= this.fixedDeltaTime;
    }

    // 2. Interpolate remote player states using snapshot buffer
    this.interpolationSystem.update(
      this.ecsWorld,
      this.playerEntities,
      this.localEntity,
      currentTime
    );

    // 3. Synchronize visual meshes & render
    this.renderSystem.update(this.ecsWorld, this.localEntity);

    // 4. Synchronize HUD
    this._updateHUD();

    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  /**
   * Decodes incoming network packets sent by the Host.
   * @private
   */
  _handleServerPacket(data) {
    const packetType = Protocol.getPacketType(data);

    if (packetType === PACKET_TYPES.STATE_SNAPSHOT) {
      const snapshot = Protocol.decodeSnapshot ? Protocol.decodeSnapshot(data) : Protocol.decodeWorldSnapshot(data);

      if (!snapshot) return;

      // Store snapshot in buffer for remote entity LERP interpolation
      if (typeof this.interpolationSystem.addSnapshot === 'function') {
        this.interpolationSystem.addSnapshot(snapshot);
      }

      // Perform Authoritative Host Reconciliation for local predicted player state
      if (this.localEntity !== null) {
        this.reconcileSystem.update(
          this.ecsWorld,
          this.localEntity,
          snapshot
        );
      }

      // Synchronize remote player entity registration
      const playersList = snapshot.players || snapshot.entities || [];
      this._syncRemoteEntities(playersList);
    }
  }

  /**
   * Dynamically instantiates or cleans up remote player entities derived from host state snapshots.
   * @private
   */
  _syncRemoteEntities(remotePlayers) {
    for (const rPlayer of remotePlayers) {
      const remoteId = rPlayer.id || rPlayer.entityId;
      if (remoteId === this.localPlayerId) continue;

      let exists = false;
      const players = this.ecsWorld.with('player');

      for (const entity of players) {
        if (entity.player && entity.player.id === remoteId) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        const remoteEntity = createPlayer(
          this.ecsWorld,
          this.physicsWorld,
          this.sceneManager.scene,
          remoteId,
          rPlayer.position || { x: rPlayer.x || 0, y: rPlayer.y || 3, z: rPlayer.z || 0 },
          false
        );
        this.playerEntities.push(remoteEntity);
      }
    }
  }

  /**
   * Updates Client HUD.
   * @private
   */
  _updateHUD() {
    if (!this.localEntity) return;

    const playerComp = this.localEntity.player;
    const weaponComp = this.localEntity.weapon;

    if (playerComp) {
      this.hud.updateHealth(playerComp.health, playerComp.maxHealth);
      this.hud.setDeathOverlay(playerComp.isDead);
    }

    if (weaponComp) {
      this.hud.updateAmmo(weaponComp.ammo, weaponComp.maxAmmo);
    }
  }

  /**
   * Stops loop and destroys allocated client resources.
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