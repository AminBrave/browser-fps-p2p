import { GAME_CONFIG, PLAYER_CONFIG, NETWORK_CONFIG, STANCE, INPUT_FLAGS, WORLD_CONFIG, validateConfig } from './config/index.js';
import { World } from 'miniplex';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { PeerManager } from './network/PeerManager.js';
import { PeerTransport } from './network/transport/PeerTransport.js';
import { SceneManager } from './render/SceneManager.js';
import { HUD } from './ui/HUD.js';
import { Protocol } from './network/Protocol.js';
import { PACKET_TYPES, EVENT_TYPES } from './network/PacketTypes.js';
import { createPlayer } from './game/player/createPlayer.js';
import { createMap } from './game/world/createMap.js';
import { InputSystem } from './ecs/systems/InputSystem.js';
import { WeaponSystem } from './ecs/systems/WeaponSystem.js';
import { WeaponPresentation } from './presentation/weapon/WeaponPresentation.js';
import { PresentationColliderRegistry } from './presentation/world/PresentationColliderRegistry.js';
import { RenderSystem } from './presentation/render/RenderSystem.js';
import { ClientPredictSystem } from './ecs/systems/network/ClientPredictSystem.js';
import { ClientReconcileSystem } from './ecs/systems/network/ClientReconcileSystem.js';
import { InterpolationSystem } from './ecs/systems/network/InterpolationSystem.js';
import { CircularBuffer } from './utils/CircularBuffer.js';
import { GameLoop } from './core/GameLoop.js';
import { audio } from './audio/AudioManager.js';
import { ImpactSystem } from './presentation/impact/ImpactSystem.js';
import { PresentationEffectStore } from './presentation/effects/PresentationEffectStore.js';
import { applyWorldManifest } from './network/WorldSync.js';
import { getAccuracyState } from './utils/AccuracyModel.js';

export class ClientGame {
  constructor(containerElement) {
    this.container = containerElement;
    this.ecsWorld = new World();
    this.physicsWorld = new PhysicsWorld();
    this.sceneManager = new SceneManager(this.container);
    this.effectStore = new PresentationEffectStore();
    this.impactSystem = new ImpactSystem(this.effectStore, this.sceneManager);
    this.presentationColliderRegistry = new PresentationColliderRegistry();
    this.peerManager = new PeerManager();
    this.networkTransport = new PeerTransport(this.peerManager);
    this.hud = new HUD();

    this.localPlayerId = null;
    this.localEntity = null;
    this.playerEntities = [];
    this.playerById = new Map();
    this.pendingInputBuffer = new CircularBuffer(NETWORK_CONFIG.INPUT_HISTORY_SIZE);
    this.fixedDeltaTime = 1 / (NETWORK_CONFIG.CLIENT_TICK_RATE || PLAYER_CONFIG.TICK_RATE || 60);
    this.isRunning = false;
    this._spawnPosition = null;
    this._worldHash = null;
    // Network callbacks only enqueue state. The fixed loop owns simulation.
    this._pendingSnapshot = null;
    this._latestSnapshot = null;
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
    this.networkTransport.onData((_id, dataView) => this._handleServerPacket(dataView));

    this._audioUnlockHandler = () => audio.unlock();
    window.addEventListener('click', this._audioUnlockHandler);
  }

  async initialize(hostRoomId) {
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
    this.renderSystem = new RenderSystem(this.sceneManager);
    this.weaponPresentation = new WeaponPresentation({
      sceneManager: this.sceneManager,
      impactSystem: this.impactSystem,
      renderSystem: this.renderSystem,
      colliderRegistry: this.presentationColliderRegistry,
      effectStore: this.effectStore,
    });
    this.weaponSystem = new WeaponSystem({
      physicsWorld: this.physicsWorld,
      healthSystem: null,
      isAuthoritative: false,
      eventSink: null,
    });
    this.renderSystem.setEventSink((event) => this.networkTransport.sendToHost(Protocol.encodeGameEvent(event)));

    this.localPlayerId = await this.networkTransport.initializeClient(hostRoomId);

    // WebRTC transport establishment is not the same thing as admission to
    // the game. Explicitly request admission so the host can validate and
    // initialize the player before sending authoritative world state.
    const joinSent = this.networkTransport.sendToHost(Protocol.encodeJoinRequest());
    if (!joinSent) {
      throw new Error('WebRTC transport opened, but the join request could not be sent.');
    }

    const handshakeTimeout = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(
          'Host did not complete the game handshake within ' +
          NETWORK_CONFIG.HANDSHAKE.JOIN_TIMEOUT_MS + 'ms.'
        )),
        NETWORK_CONFIG.HANDSHAKE.JOIN_TIMEOUT_MS
      );
    });

    await Promise.race([
      Promise.all([this._worldReadyPromise, this._joinReadyPromise]),
      handshakeTimeout,
    ]);
    validateConfig();

    // Rebuild simulation timing/buffers from the host's authoritative
    // configuration before constructing any prediction/reconciliation system.
    this.fixedDeltaTime =
      1 / (NETWORK_CONFIG.CLIENT_TICK_RATE || NETWORK_CONFIG.CLIENT_TICK_RATE || GAME_CONFIG.TICK_RATE || 60);
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

    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager, this.presentationColliderRegistry);

    const spawn = this._spawnPosition || {
      ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[1 % WORLD_CONFIG.PLAYER.SPAWN_POINTS.length],
      y: WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2,
    };

    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      spawn,
      true,
      false,
      this.presentationColliderRegistry
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

    // 1) Consume at most one newest authoritative snapshot on the simulation
    // boundary. Network callbacks never mutate Rapier.
    const snapshot = this._pendingSnapshot;
    this._pendingSnapshot = null;
    if (snapshot) {
      const wasReconciled = this.reconcileSystem.update(
        this.ecsWorld,
        this.localEntity,
        snapshot
      );
      if (wasReconciled) {
        // A reconciliation is a simulation timeline discontinuity. Do not let
        // the renderer interpolate across the old and corrected positions.
        this.renderSystem.snapFixedStateToPhysics(this.localEntity);
      }
      const players = snapshot.players || snapshot.entities || [];
      const me = players.find(
        (player) => (player.id ?? player.entityId) === this.localEntity.player?.id
      );
      if (me && this.localEntity.player) {
        const wasAlive = !this.localEntity.player.isDead;
        this.localEntity.player.health = me.health;
        this.localEntity.player.kills = me.kills ?? this.localEntity.player.kills ?? 0;
        this.localEntity.player.deaths = me.deaths ?? this.localEntity.player.deaths ?? 0;
        this.localEntity.player.isDead = me.health <= 0;
        if (wasAlive && this.localEntity.player.isDead) audio.playDeath();
      }
      this._syncRemoteEntities(players);
    }

    // Client-side visuals follow the same authoritative health state as the
    // snapshot. This is especially important for impacts attached to remote
    // player meshes: clients do not run the authoritative HealthSystem.
    for (const entity of this.ecsWorld.with('player')) {
      const health = Math.max(0, Number(entity.player?.health) || 0);
      const maxHealth = Math.max(1, Number(entity.player?.maxHealth) || GAME_CONFIG.MAX_HEALTH || 100);
      this.impactSystem?.updatePlayerImpactMarksForHealth?.(entity.player?.id ?? entity, health, maxHealth);
    }

    const inputPayload = this.inputSystem.sample(this.ecsWorld, this.localEntity);
    if (!inputPayload) return;

    inputPayload.deltaTime = dt;
    this.predictSystem.update(this.ecsWorld, this.localEntity, dt);

    // Exactly one Rapier step for this client fixed tick.
    this.physicsWorld.step(dt);
    this.renderSystem.captureFixedState(this.localEntity);

    this.networkTransport.sendToHost(Protocol.encodeInput(inputPayload));
    this.weaponSystem.update(this.ecsWorld, performance.now(), dt);
    this._flushWeaponPresentationEvents();
  }

  _flushWeaponPresentationEvents() {
    if (!this.weaponSystem || !this.weaponPresentation) return;

    const events = this.weaponSystem.drainPresentationEvents?.() || [];
    for (const event of events) {
      this.weaponPresentation.handleEvent(event);
    }
  }

  _render(_dt, now, alpha) {
    this.interpolationSystem.update(
      this.ecsWorld,
      this.playerEntities,
      this.localEntity,
      now
    );
    this.renderSystem.update(
      this.ecsWorld,
      this.localEntity,
      now,
      undefined,
      alpha
    );
    this.effectStore.update(_dt, now);
    this.sceneManager.render();
    this._updateHUD();
    const velocity = this.localEntity?.physics?.velocity;
    const speed = Math.hypot(Number(velocity?.x) || 0, Number(velocity?.z) || 0);
    const input = this.localEntity?.input;
    const weapon = this.localEntity?.weapon;
    const recoil = Math.abs(Number(weapon?.cameraRecoilPitch) || 0);
    const mask = input?.inputMask || 0;
    const isSprinting = !!(
      (mask & INPUT_FLAGS.SPRINT) &&
      (mask & INPUT_FLAGS.FORWARD) &&
      (input?.stance ?? STANCE.STAND) === STANCE.STAND
    );

    // The HUD consumes the exact same accuracy model as WeaponSystem.
    // This prevents the reticle from drifting out of sync with actual shots.
    const intensity = Math.hypot(
      Number(velocity?.x) || 0,
      Number(velocity?.z) || 0
    );
    const stance = input?.stance ?? STANCE.STAND;
    const accuracy = getAccuracyState({
      stance,
      speed: intensity,
      maxSpeed: GAME_CONFIG.MAX_SPEED ?? 10.8,
      isAiming: !!input?.isAiming,
      isSprinting,
      steadySpread: Number(weapon?.steadySpread) || 0.003,
      baseSpread: Number(weapon?.spreadBase) || 0,
      bloom: Number(weapon?.currentSpread) || 0,
      spreadMax: Number(weapon?.spreadMax) || 0.05,
      moveSpreadMax: GAME_CONFIG.MOVE_SPREAD_MAX ?? 0.035,
    });

    this.hud.updateCrosshair({
      spread: accuracy.rawSpread,
      spreadMax: Number(weapon?.spreadMax) || 0.05,
      isAiming: !!input?.isAiming,
      isFiring: !!(mask & INPUT_FLAGS.SHOOT),
      recoil,
      speed01: accuracy.speedT,
      isSprinting,
    });
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

    if (packetType === PACKET_TYPES.JOIN_ACCEPT) {
      const accepted = Protocol.decodeJoinAccept(dataView);
      if (!accepted) return;
      if (accepted.spawn) this._spawnPosition = accepted.spawn;
      this._resolveJoinReady?.(accepted);
      this._resolveJoinReady = null;
      this._rejectJoinReady = null;
      return;
    }

    if (
      packetType !== PACKET_TYPES.WORLD_SNAPSHOT &&
      packetType !== PACKET_TYPES.STATE_SNAPSHOT
    ) return;

    const snapshot = Protocol.decodeWorldSnapshot(dataView);
    if (!snapshot) return;

    if (this.interpolationSystem) this.interpolationSystem.addSnapshot(snapshot);

    // Ordered delivery is expected, but discard stale packets defensively.
    const previousTick = this._latestSnapshot?.serverTick;
    const nextTick = Number(snapshot.serverTick) >>> 0;
    const newer =
      previousTick == null ||
      (((nextTick - (Number(previousTick) >>> 0)) >>> 0) !== 0 &&
        (((nextTick - (Number(previousTick) >>> 0)) >>> 0) < 0x80000000));
    if (newer) {
      this._pendingSnapshot = snapshot;
      this._latestSnapshot = snapshot;
    }
  }

  _handleGameEvent(event) {
    if (!event) return;
    const localId = this.localEntity?.player?.id;
    if (event.shooterId === localId) return;
    if (
      event.type === EVENT_TYPES.SFX &&
      event.sourceId === localId &&
      ['reloadStart', 'reloadEnd', 'footstep', 'jump', 'land'].includes(event.sfx)
    ) return;

    if (event.type === EVENT_TYPES.SHOT) {
      const target = event.hitEntityId != null ? this.playerById.get(event.hitEntityId) : null;
      const zone = event.hitZone || 'torso';
      const targetMesh = target?.character?.parts?.[zone] || target?.character?.parts?.torso || null;
      this.weaponPresentation.handleEvent({ type: 'shot', shot: event, targetMesh });
      return;
    }

    if (event.type === EVENT_TYPES.IMPACT) {
      if (event.hit) audio.playImpactAt?.(event.position);
      return;
    }

    if (event.type === EVENT_TYPES.SFX) {
      if (event.sfx === 'reloadStart') audio.playReloadStartAt?.(event.position);
      else if (event.sfx === 'reloadEnd') audio.playReloadEndAt?.(event.position);
      else if (event.sfx === 'footstep') audio.playFootstepAt?.(event.position, event.stance ?? 0);
      else if (event.sfx === 'jump') audio.playJumpAt?.(event.position);
      else if (event.sfx === 'land') audio.playLandAt?.(event.position);
      else if (event.sfx === 'hit') audio.playHitAt?.(event.position);
      else if (event.sfx === 'death') audio.playDeathAt?.(event.position);
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
            y: remote.y ?? remote.position?.y ?? (WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2),
            z: remote.z ?? remote.position?.z ?? 0,
          },
          false,
          false,
          this.presentationColliderRegistry
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
        entity.player.kills = remote.kills ?? entity.player.kills ?? 0;
        entity.player.deaths = remote.deaths ?? entity.player.deaths ?? 0;
        entity.player.isDead = remote.health <= 0 || !!remote.isDead;
      }

      this.physicsWorld.updatePlayerHitZones(entity.physics, remote.stance ?? 0);

      entity.player.remoteStance = remote.stance ?? 0;
      entity.player.remotePitch = remote.pitch ?? remote.rotation?.pitch ?? 0;
      entity.player.remoteWeaponId = remote.weaponId ?? 1;
      entity.character?.setWeaponType?.(entity.player.remoteWeaponId);
      entity.input.stance = entity.player.remoteStance;
      entity.input.pitch = entity.player.remotePitch;
      entity.input.isAiming = !!remote.isAiming;
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
      this.presentationColliderRegistry.unregister(collider);
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
      this.hud.updateScoreboard(p.kills || 0, p.deaths || 0);
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
    this.impactSystem?.dispose();
    this.effectStore?.dispose();
    this.presentationColliderRegistry.clear();
    this.sceneManager.dispose();
    this.physicsWorld.dispose();
    this.networkTransport.destroy();
    this.pendingInputBuffer.clear();
    this.playerEntities.length = 0;
    this.playerById.clear();
    window.removeEventListener('click', this._audioUnlockHandler);
    this.gameLoop = null;
  }
}
