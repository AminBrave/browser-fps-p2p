import { GAME_CONFIG, NETWORK_CONFIG, STANCE, WORLD_CONFIG, validateConfig } from './config/index.js';
import { World } from 'miniplex';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { PeerManager } from './network/PeerManager.js';
import { SceneManager } from './render/SceneManager.js';
import { HUD } from './ui/HUD.js';
import { Protocol } from './network/Protocol.js';
import { PACKET_TYPES, EVENT_TYPES } from './network/PacketTypes.js';
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
import { createBullet, createImpactDecal, createBloodImpact, disposeImpactDecals } from './ecs/entities/createBullet.js';
import { applyWorldManifest } from './network/WorldSync.js';

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
    this.pendingInputBuffer = new CircularBuffer(NETWORK_CONFIG.INPUT_HISTORY_SIZE);
    this.fixedDeltaTime = 1 / (NETWORK_CONFIG.CLIENT_TICK_RATE || GAME_CONFIG.TICK_RATE || 60);
    this.isRunning = false;
    this._spawnPosition = null;
    this._worldHash = null;
    // Apply network corrections only on the fixed simulation boundary.
    this._pendingSnapshot = null;
    this._worldReadyPromise = new Promise((resolve, reject) => {
      this._resolveWorldReady = resolve;
      this._rejectWorldReady = reject;
    });
    this._joinReadyPromise = new Promise((resolve, reject) => {
      this._resolveJoinReady = resolve;
      this._rejectJoinReady = reject;
    });

    // Install the handler before opening the WebRTC connection. The host sends
    // the world manifest immediately when the connection opens.
    this.peerManager.onData((_id, dataView) => this._handleServerPacket(dataView));

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

    this.localPlayerId = await this.peerManager.initializeClient(hostRoomId);
    await Promise.all([this._worldReadyPromise, this._joinReadyPromise]);
    validateConfig();

    // Rebuild simulation timing/buffers from the host's authoritative
    // configuration before constructing any prediction/reconciliation system.
    this.fixedDeltaTime =
      1 / (NETWORK_CONFIG.CLIENT_TICK_RATE || GAME_CONFIG.TICK_RATE || 60);
    this.pendingInputBuffer = new CircularBuffer(NETWORK_CONFIG.INPUT_HISTORY_SIZE);
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

    const spawn = this._spawnPosition || {
      ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[1 % WORLD_CONFIG.PLAYER.SPAWN_POINTS.length],
      y: WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2,
    };

    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      spawn,
      true,
      false
    );
    this.playerEntities.push(this.localEntity);
    this.playerById.set(this.localEntity.player.id, this.localEntity);

    this.hud.setVisible(true);

    this.gameLoop = new GameLoop({
      fixedDeltaTime: this.fixedDeltaTime,
      onFixedUpdate: (dt) => this._fixedUpdate(dt),
      onRender: (dt, now, alpha) => this._render(dt, now, alpha),
    });
  }

  _fixedUpdate(dt) {
    if (!this.localEntity) return;

    // WebRTC callbacks are asynchronous. Applying Rapier/camera state from
    // that callback can race the fixed simulation and produce visible jitter.
    const snapshot = this._pendingSnapshot;
    this._pendingSnapshot = null;
    if (snapshot) {
      this.reconcileSystem.update(this.ecsWorld, this.localEntity, snapshot);
      const players = snapshot.players || snapshot.entities || [];
      const me = players.find(
        (player) => (player.id ?? player.entityId) === this.localEntity.player?.id
      );
      if (me && this.localEntity.player) {
        const wasAlive = !this.localEntity.player.isDead;
        this.localEntity.player.health = me.health;
        this.localEntity.player.isDead = me.health <= 0;
        if (wasAlive && this.localEntity.player.isDead) audio.playDeath();
      }
      this._syncRemoteEntities(players);
    }

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
    this.renderSystem.captureFixedState(this.localEntity);

    this.peerManager.sendToHost(Protocol.encodeInput(inputPayload));
    this.weaponSystem.update(this.ecsWorld, performance.now(), dt);
  }

  _render(_dt, now, alpha) {
    this.interpolationSystem.update(
      this.ecsWorld,
      this.playerEntities,
      this.localEntity,
      now
    );
    this.renderSystem.update(this.ecsWorld, this.localEntity, now, undefined, alpha);
    this.sceneManager.render();
    this._updateHUD();
  }

  _handleServerPacket(dataView) {
    const packetType = Protocol.getPacketType(dataView);

    if (packetType === PACKET_TYPES.GAME_EVENT) {
      this._handleGameEvent(Protocol.decodeGameEvent(dataView));
      return;
    }

    if (packetType === PACKET_TYPES.WORLD_INIT) {
      try {
        const manifest = Protocol.decodeWorldInit(dataView);
        this._worldHash = applyWorldManifest(manifest);
        this._resolveWorldReady?.(this._worldHash);
        this._resolveWorldReady = null;
        this._rejectWorldReady = null;
      } catch (error) {
        this._rejectWorldReady?.(error);
        this._resolveWorldReady = null;
        this._rejectWorldReady = null;
      }
      return;
    }

  _handleGameEvent(event) {
    if (!event || event.sourceId === this.localEntity?.player?.id || event.shooterId === this.localEntity?.player?.id) {
      return;
    }

    if (event.type === EVENT_TYPES.SHOT) {
      const origin = event.origin;
      const end = event.end;
      if (!origin || !end) return;

      createBullet(this.ecsWorld, this.sceneManager, origin, end);

      if (event.hit && event.hitEntityId != null) {
        const target = this.playerById.get(event.hitEntityId);
        const zone = event.hitZone || 'torso';
        const targetMesh = target?.character?.parts?.[zone] || target?.character?.parts?.torso || null;
        if (targetMesh) {
          createBloodImpact(this.ecsWorld, this.sceneManager, end, event.normal, targetMesh);
        }
      } else if (event.hit) {
        createImpactDecal(this.ecsWorld, this.sceneManager, end, event.normal);
      }

      if (event.primary) {
        audio.playShootAt?.(event.sfx || 'pistol', origin);
        if (event.hit) audio.playImpactAt?.(end);
      }
      return;
    }

    if (event.type === EVENT_TYPES.IMPACT) {
      if (event.hit) audio.playImpactAt?.(event.position);
      return;
    }

    if (event.type === EVENT_TYPES.SFX) {
      if (event.sfx === 'reloadStart') audio.playReloadStartAt?.(event.position);
      else if (event.sfx === 'reloadEnd') audio.playReloadEndAt?.(event.position);
    }
  }

    if (packetType === PACKET_TYPES.JOIN_ACCEPT) {
      const accepted = Protocol.decodeJoinAccept(dataView);
      if (!accepted) return;

      if (accepted.spawn) {
        this._spawnPosition = accepted.spawn;
      }

      // Do not construct the local map/player until the host has assigned the
      // authoritative spawn. WorldInit + JoinAccept together form the match
      // bootstrap barrier.
      this._resolveJoinReady?.(accepted);
      this._resolveJoinReady = null;
      this._rejectJoinReady = null;
      return;
    }

    if (
      packetType !== PACKET_TYPES.WORLD_SNAPSHOT &&
      packetType !== PACKET_TYPES.STATE_SNAPSHOT
    ) {
      return;
    }

    const snapshot = Protocol.decodeWorldSnapshot(dataView);
    if (!snapshot || !this.interpolationSystem) return;

    this.interpolationSystem.addSnapshot(snapshot);\n\n    // Store the newest snapshot; body/physics changes are applied by\n    // _fixedUpdate() so Rapier is never mutated from an async network event.\n    this._pendingSnapshot = snapshot;
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
            y: remote.y ?? remote.position?.y ?? (WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2),
            z: remote.z ?? remote.position?.z ?? 0,
          },
          false,
          false
        );
        entity.player.id = remoteId;
        entity.networkRole = 'remote';
        this.playerEntities.push(entity);
        this.playerById.set(remoteId, entity);
      }

      const authoritativePosition = {
        x: remote.x ?? remote.position?.x ?? 0,
        y: remote.y ?? remote.position?.y ?? (WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2),
        z: remote.z ?? remote.position?.z ?? 0,
      };
      entity.transform.position.x = authoritativePosition.x;
      entity.transform.position.y = authoritativePosition.y;
      entity.transform.position.z = authoritativePosition.z;
      entity.physics?.rigidBody?.setTranslation?.(authoritativePosition, true);

      const authoritativeYaw = remote.yaw ?? remote.rotation?.yaw ?? 0;
      const authoritativePitch = remote.pitch ?? remote.rotation?.pitch ?? 0;
      if (entity.transform.rotation) {
        entity.transform.rotation.yaw = authoritativeYaw;
        entity.transform.rotation.pitch = authoritativePitch;
      }

      if (remote.health !== undefined) {
        entity.player.health = remote.health;
        entity.player.isDead = remote.health <= 0 || !!remote.isDead;
      }

      entity.player.remoteStance = remote.stance ?? 0;
      entity.player.remotePitch = remote.pitch ?? remote.rotation?.pitch ?? 0;
      entity.player.remoteWeaponId = remote.weaponId ?? 1;
      entity.character?.setWeaponType?.(entity.player.remoteWeaponId);
      entity.input.stance = entity.player.remoteStance;
      entity.input.pitch = entity.player.remotePitch;
    }

    // A player missing from an authoritative snapshot has left the match.
    for (const [id, entity] of this.playerById) {
      if (entity === this.localEntity || remoteIds.has(id)) continue;
      this._removeRemoteEntity(id, entity);
    }
  }

  _removeRemoteEntity(id, entity) {
    const physics = entity.physics;
    for (const collider of physics?.colliders || (physics?.collider ? [physics.collider] : [])) {
      this.physicsWorld.unregisterCollider?.(collider);
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
