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
 * Orchestrates the client session: local input prediction, state reconciliation
 * against authoritative host snapshots, entity interpolation for remote players, and local rendering.
 */
export class ClientGame {
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

    this.localPlayerId = null;
    this.localEntity = null;
    this.playerEntities = [];

    this.pendingInputBuffer = new CircularBuffer(128);

    this.lastFrameTime = performance.now();
    this.accumulatedTime = 0;
    this.fixedDeltaTime = 1 / (GAME_CONFIG.TICK_RATE || 60);

    this.isRunning = false;
    this.animationFrameId = null;
  }

  /**
   * @param {string} hostRoomId
   * @returns {Promise<void>}
   */
  async initialize(hostRoomId) {
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.renderSystem = new RenderSystem(this.sceneManager.scene, this.sceneManager.camera);

    this.predictSystem = new ClientPredictSystem(this.physicsWorld, this.pendingInputBuffer);
    this.reconcileSystem = new ClientReconcileSystem(this.physicsWorld, this.pendingInputBuffer);
    this.interpolationSystem = new InterpolationSystem();

    // Pass SceneManager so createMap can use .scene consistently
    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager);

    // initializeClient now resolves with local PeerJS id
    this.localPlayerId = await this.peerManager.initializeClient(hostRoomId);

    // PeerManager always invokes (peerId, dataView) — ignore peerId on client (only host talks)
    this.peerManager.onData((_peerId, dataView) => {
      this._handleServerPacket(dataView);
    });

    const spawnPos = { x: 0, y: 3, z: 0 };
    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      spawnPos,
      true,
      false
    );
    this.playerEntities.push(this.localEntity);

    this.hud.setVisible(true);
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

    const inputPayload = this.inputSystem.update(this.ecsWorld, this.localEntity);

    if (inputPayload && this.localEntity) {
      inputPayload.deltaTime = this.fixedDeltaTime;

      this.predictSystem.update(this.ecsWorld, this.localEntity, this.fixedDeltaTime);

      const encodedInput = Protocol.encodeInput(inputPayload);
      this.peerManager.sendToHost(encodedInput);
    }

    while (this.accumulatedTime >= this.fixedDeltaTime) {
      this.physicsSystem.update(this.ecsWorld, this.fixedDeltaTime);
      this.accumulatedTime -= this.fixedDeltaTime;
    }

    this.interpolationSystem.update(
      this.ecsWorld,
      this.playerEntities,
      this.localEntity,
      currentTime
    );

    this.renderSystem.update(this.ecsWorld, this.localEntity);
    this.sceneManager.render();

    this._updateHUD();

    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  /**
   * @param {DataView} dataView
   * @private
   */
  _handleServerPacket(dataView) {
    const packetType = Protocol.getPacketType(dataView);

    if (packetType === PACKET_TYPES.WORLD_SNAPSHOT || packetType === PACKET_TYPES.STATE_SNAPSHOT) {
      const snapshot = Protocol.decodeWorldSnapshot(dataView);
      if (!snapshot) return;

      this.interpolationSystem.addSnapshot(snapshot);

      if (this.localEntity) {
        this.reconcileSystem.update(this.ecsWorld, this.localEntity, snapshot);
      }

      const playersList = snapshot.players || snapshot.entities || [];
      this._syncRemoteEntities(playersList);
    }
  }

  /**
   * @param {Array} remotePlayers
   * @private
   */
  _syncRemoteEntities(remotePlayers) {
    for (const rPlayer of remotePlayers) {
      const remoteId = rPlayer.id ?? rPlayer.entityId;
      // Skip local player (matched by numeric id)
      if (this.localEntity?.player && remoteId === this.localEntity.player.id) continue;

      let exists = false;
      for (const entity of this.ecsWorld.with('player')) {
        if (entity.player && entity.player.id === remoteId) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        const remoteEntity = createPlayer(
          this.ecsWorld,
          this.physicsWorld,
          this.sceneManager,
          remoteId,
          rPlayer.position || {
            x: rPlayer.x || 0,
            y: rPlayer.y || 3,
            z: rPlayer.z || 0,
          },
          false,
          false
        );
        // Force numeric id from snapshot so future matches work
        if (remoteEntity.player) {
          remoteEntity.player.id = remoteId;
        }
        this.playerEntities.push(remoteEntity);
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
