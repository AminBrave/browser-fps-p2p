import { GAME_CONFIG, STANCE } from './config/constants.js';
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
import { WeaponSystem } from './ecs/systems/WeaponSystem.js';
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { ClientPredictSystem } from './ecs/systems/network/ClientPredictSystem.js';
import { ClientReconcileSystem } from './ecs/systems/network/ClientReconcileSystem.js';
import { InterpolationSystem } from './ecs/systems/network/InterpolationSystem.js';
import { CircularBuffer } from './utils/CircularBuffer.js';
import { GameLoop } from './core/GameLoop.js';
import { audio } from './audio/AudioManager.js';
import { disposeImpactDecals } from './ecs/entities/createBullet.js';

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
    this.playerById = new Map();
    this.pendingInputBuffer = new CircularBuffer(128);
    this.fixedDeltaTime = 1 / (GAME_CONFIG.TICK_RATE || 60);
    this.isRunning = false;

    this._audioUnlockHandler = () => audio.unlock();
    window.addEventListener('click', this._audioUnlockHandler);
  }

  async initialize(hostRoomId) {
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
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
    this.playerById.set(this.localEntity.player.id, this.localEntity);

    this.hud.setVisible(true);

    this.gameLoop = new GameLoop({
      fixedDeltaTime: this.fixedDeltaTime,
      onFixedUpdate: (dt) => this._fixedUpdate(dt),
      onRender: (dt, now) => this._render(dt, now),
    });
  }

  _fixedUpdate(dt) {
    if (!this.localEntity) return;

    const inputPayload = this.inputSystem.sample(
      this.ecsWorld,
      this.localEntity
    );
    if (!inputPayload) return;

    inputPayload.deltaTime = dt;
    this.predictSystem.update(
      this.ecsWorld,
      this.localEntity,
      dt
    );

    // Prediction writes a kinematic target; advance Rapier exactly once per
    // fixed tick so the next prediction starts from the current body state.
    this.physicsWorld.step(dt);

    this.peerManager.sendToHost(Protocol.encodeInput(inputPayload));
    this.weaponSystem.update(this.ecsWorld, performance.now(), dt);
  }

  _render(_dt, now) {
    this.interpolationSystem.update(
      this.ecsWorld,
      this.playerEntities,
      this.localEntity,
      now
    );
    this.renderSystem.update(this.ecsWorld, this.localEntity, now);
    this.sceneManager.render();
    this._updateHUD();
  }

  _handleServerPacket(dataView) {
    const packetType = Protocol.getPacketType(dataView);
    if (
      packetType !== PACKET_TYPES.WORLD_SNAPSHOT &&
      packetType !== PACKET_TYPES.STATE_SNAPSHOT
    ) {
      return;
    }

    const snapshot = Protocol.decodeWorldSnapshot(dataView);
    if (!snapshot) return;

    this.interpolationSystem.addSnapshot(snapshot);

    if (this.localEntity) {
      this.reconcileSystem.update(
        this.ecsWorld,
        this.localEntity,
        snapshot
      );

      const players = snapshot.players || snapshot.entities || [];
      const me = players.find(
        (player) => (player.id ?? player.entityId) === this.localEntity.player?.id
      );

      if (me && this.localEntity.player) {
        const wasAlive = !this.localEntity.player.isDead;
        this.localEntity.player.health = me.health;
        this.localEntity.player.isDead = me.health <= 0;
        if (wasAlive && this.localEntity.player.isDead) {
          audio.playDeath();
        }
      }

      this._syncRemoteEntities(players);
    }
  }

  _syncRemoteEntities(remotePlayers) {
    const remoteIds = new Set();

    for (const remote of remotePlayers) {
      const remoteId = remote.id ?? remote.entityId;
      if (remoteId == null || remoteId === this.localEntity?.player?.id) continue;

      remoteIds.add(remoteId);

      let entity = this.playerById.get(remoteId);
      if (!entity) {
        entity = createPlayer(
          this.ecsWorld,
          this.physicsWorld,
          this.sceneManager,
          remoteId,
          {
            x: remote.x ?? remote.position?.x ?? 0,
            y: remote.y ?? remote.position?.y ?? 3,
            z: remote.z ?? remote.position?.z ?? 0,
          },
          false,
          false
        );
        entity.player.id = remoteId;
        this.playerEntities.push(entity);
        this.playerById.set(remoteId, entity);
      }

      if (remote.health !== undefined) {
        entity.player.health = remote.health;
        entity.player.isDead = remote.health <= 0;
        entity.renderMesh.mesh.visible = !entity.player.isDead;
      }
    }

    // A player missing from an authoritative snapshot has left the match.
    for (const [id, entity] of this.playerById) {
      if (entity === this.localEntity || remoteIds.has(id)) continue;
      this._removeRemoteEntity(id, entity);
    }
  }

  _removeRemoteEntity(id, entity) {
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
    this.playerById.delete(id);

    const index = this.playerEntities.indexOf(entity);
    if (index !== -1) this.playerEntities.splice(index, 1);
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

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.gameLoop?.start();
  }

  stop() {
    if (!this.isRunning && !this.gameLoop) return;

    this.isRunning = false;
    this.gameLoop?.stop();
    this.inputSystem?.dispose();
    this.renderSystem?.dispose();
    this.hud.dispose();
    disposeImpactDecals(this.ecsWorld);
    this.sceneManager.dispose();
    this.physicsWorld.dispose();
    this.peerManager.destroy();
    this.pendingInputBuffer.clear();
    this.playerEntities.length = 0;
    this.playerById.clear();
    window.removeEventListener('click', this._audioUnlockHandler);
    this.gameLoop = null;
  }
}
