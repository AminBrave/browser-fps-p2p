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
import { WeaponSystem } from './ecs/systems/WeaponSystem.js';
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { ClientPredictSystem } from './ecs/systems/network/ClientPredictSystem.js';
import { ClientReconcileSystem } from './ecs/systems/network/ClientReconcileSystem.js';
import { InterpolationSystem } from './ecs/systems/network/InterpolationSystem.js';
import { CircularBuffer } from './utils/CircularBuffer.js';
import { audio } from './audio/AudioManager.js';

export class ClientGame {
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

    const unlock = () => {
      audio.unlock();
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('click', unlock);
  }

  async initialize(hostRoomId) {
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.renderSystem = new RenderSystem(this.sceneManager);
    this.weaponSystem = new WeaponSystem(
      this.physicsWorld,
      this.sceneManager,
      null,
      false,
      this.renderSystem
    );

    this.predictSystem = new ClientPredictSystem(
      this.physicsWorld,
      this.pendingInputBuffer
    );
    this.reconcileSystem = new ClientReconcileSystem(
      this.physicsWorld,
      this.pendingInputBuffer
    );
    this.interpolationSystem = new InterpolationSystem();

    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager);

    this.localPlayerId = await this.peerManager.initializeClient(hostRoomId);
    this.peerManager.onData((_id, dataView) => this._handleServerPacket(dataView));

    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      { x: 0, y: 3, z: 0 },
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
      this.peerManager.sendToHost(Protocol.encodeInput(inputPayload));
    }

    while (this.accumulatedTime >= this.fixedDeltaTime) {
      this.physicsSystem.update(this.ecsWorld, this.fixedDeltaTime);
      this.weaponSystem.update(this.ecsWorld, performance.now());
      this.accumulatedTime -= this.fixedDeltaTime;
    }

    this.interpolationSystem.update(
      this.ecsWorld,
      this.playerEntities,
      this.localEntity,
      currentTime
    );
    this.renderSystem.update(this.ecsWorld, this.localEntity, currentTime);
    this.sceneManager.render();
    this._updateHUD();

    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  _handleServerPacket(dataView) {
    const packetType = Protocol.getPacketType(dataView);
    if (
      packetType === PACKET_TYPES.WORLD_SNAPSHOT ||
      packetType === PACKET_TYPES.STATE_SNAPSHOT
    ) {
      const snapshot = Protocol.decodeWorldSnapshot(dataView);
      if (!snapshot) return;
      this.interpolationSystem.addSnapshot(snapshot);
      if (this.localEntity) {
        this.reconcileSystem.update(this.ecsWorld, this.localEntity, snapshot);
        const me = (snapshot.players || snapshot.entities || []).find(
          (p) => (p.id ?? p.entityId) === this.localEntity.player?.id
        );
        if (me && this.localEntity.player) {
          const wasAlive = !this.localEntity.player.isDead;
          this.localEntity.player.health = me.health;
          this.localEntity.player.isDead = me.health <= 0;
          if (wasAlive && this.localEntity.player.isDead) audio.playDeath();
        }
      }
      this._syncRemoteEntities(snapshot.players || snapshot.entities || []);
    }
  }

  _syncRemoteEntities(remotePlayers) {
    for (const rPlayer of remotePlayers) {
      const remoteId = rPlayer.id ?? rPlayer.entityId;
      if (this.localEntity?.player && remoteId === this.localEntity.player.id) continue;

      let exists = false;
      for (const entity of this.ecsWorld.with('player')) {
        if (entity.player?.id === remoteId) {
          exists = true;
          if (rPlayer.health !== undefined) {
            entity.player.health = rPlayer.health;
            entity.player.isDead = rPlayer.health <= 0;
            if (entity.renderMesh?.mesh) {
              entity.renderMesh.mesh.visible = !entity.player.isDead;
            }
          }
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
        if (remoteEntity.player) remoteEntity.player.id = remoteId;
        this.playerEntities.push(remoteEntity);
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
        w.magazine ?? w.ammo ?? 0,
        w.reserveAmmo ?? 0,
        !!w.isReloading,
        w.fireMode
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
