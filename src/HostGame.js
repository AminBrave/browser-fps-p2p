import { GAME_CONFIG, PLAYER_CONFIG, NETWORK_CONFIG, STANCE, INPUT_FLAGS, WORLD_CONFIG, validateConfig, getSavedPlayerName, normalizePlayerName } from './config/index.js';
import { World } from 'miniplex';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { PeerManager } from './network/PeerManager.js';
import { PeerTransport } from './network/transport/PeerTransport.js';
import { SceneManager } from './render/SceneManager.js';
import { HUD } from './ui/HUD.js';
import { createPlayer } from './game/player/createPlayer.js';
import { createMap } from './game/world/createMap.js';
import { InputSystem } from './ecs/systems/InputSystem.js';
import { PhysicsSystem } from './ecs/systems/PhysicsSystem.js';
import { HealthSystem } from './ecs/systems/HealthSystem.js';
import { HealthPresentation } from './presentation/health/HealthPresentation.js';
import { WeaponSystem } from './ecs/systems/WeaponSystem.js';
import { WeaponPresentation } from './presentation/weapon/WeaponPresentation.js';
import { PresentationColliderRegistry } from './presentation/world/PresentationColliderRegistry.js';
import { RenderSystem } from './presentation/render/RenderSystem.js';
import { HostNetworkSystem } from './ecs/systems/network/HostNetworkSystem.js';
import { GameLoop } from './core/GameLoop.js';
import { audio } from './audio/AudioManager.js';
import { getAccuracyState } from './utils/AccuracyModel.js';
import { ImpactSystem } from './presentation/impact/ImpactSystem.js';
import { PresentationEffectStore } from './presentation/effects/PresentationEffectStore.js';
import { Protocol } from './network/Protocol.js';
import { createWorldManifest } from './network/WorldSync.js';

export class HostGame {
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

    this.localPlayerId = 'host-player';
    this.playerName = getSavedPlayerName();
    this.localEntity = null;
    this.clientEntities = new Map();
    this.announcedClients = new Set();
    this.departedPlayers = new Map();
    this.lastSessionTelemetryAt = 0;
    this.lastNetworkLogAt = 0;
    this.isRunning = false;

    this.fixedDeltaTime =
      1 / (NETWORK_CONFIG.SERVER_TICK_RATE || PLAYER_CONFIG.TICK_RATE || 60);

    this._audioUnlockHandler = () => audio.unlock();
    window.addEventListener('click', this._audioUnlockHandler);
  }

  async initialize(networkMode = null, playerName = null) {
    this.playerName = normalizePlayerName(playerName || getSavedPlayerName());
    validateConfig();
    await this.physicsWorld.init();

    this.inputSystem = new InputSystem(this.container);
    this.physicsSystem = new PhysicsSystem(this.physicsWorld);
    this.healthPresentation = new HealthPresentation(this.impactSystem);
    this.healthSystem = new HealthSystem(this.physicsWorld);
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
      healthSystem: this.healthSystem,
      isAuthoritative: true,
      eventSink: null,
    });
    this.hostNetworkSystem = new HostNetworkSystem(this.networkTransport);
    this.hostNetworkSystem.setJoinHandler((peerId, request) => {
      const entity = this._ensureClientEntity(peerId);
      entity.player.displayName = normalizePlayerName(request?.displayName);
      this.departedPlayers.delete(String(peerId));
      this._announceClientEntity(peerId, entity);
    });
    this.healthSystem.setEventSink((event) => this.hostNetworkSystem.emitGameEvent(event));
    this.weaponSystem.setEventSink((event) => this.hostNetworkSystem.emitGameEvent(event));
    this.renderSystem.setEventSink((event) => this.hostNetworkSystem.emitGameEvent(event));

    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager, this.presentationColliderRegistry);

    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      { ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[0], y: WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2 },
      true,
      true,
      this.presentationColliderRegistry
    );
    this.localEntity.player.displayName = this.playerName;

    const hostRoomId = await this.networkTransport.initializeHost(null, networkMode);
    this.invitationCode = String(hostRoomId).toUpperCase();
    this.networkTransport.onConnect((id) => this._handleClientConnect(id));
    this.networkTransport.onDisconnect((id) => this._handleClientDisconnect(id));

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

    // Make the ECS authoritative for every currently connected peer. This
    // also covers a connection that became open before the UI callback was
    // installed, eliminating the "client connected but host has no entity"
    // race.
    for (const peerId of this.networkTransport.getPeerIds()) {
      this._ensureClientEntity(peerId);
    }

    this.inputSystem.sample(this.ecsWorld, this.localEntity);
    this.hostNetworkSystem.preUpdate(this.ecsWorld);

    this.physicsSystem.update(this.ecsWorld, dt);
    this.weaponSystem.update(this.ecsWorld, performance.now(), dt);
    this._flushWeaponPresentationEvents();
    this.healthSystem.update(this.ecsWorld);
    this._flushHealthPresentationEvents();
    this.renderSystem.captureFixedState(this.localEntity);
    // Network snapshots are emitted on the fixed tick, after Rapier commits
    // movement, so every snapshot describes an actual authoritative state.
    this.hostNetworkSystem.postUpdate(this.ecsWorld, performance.now());
    this._updateMultiplayerTelemetry(performance.now());
  }


  _flushWeaponPresentationEvents() {
    if (!this.weaponPresentation) return;
    for (const event of this.weaponSystem.drainPresentationEvents()) {
      if (event.type === 'shot') {
        const targetMesh = this.presentationColliderRegistry.getTargetByHandle?.(event.hitColliderHandle) || null;
        this.weaponPresentation.handleEvent({ ...event, targetMesh });
      } else {
        this.weaponPresentation.handleEvent(event);
      }
    }
  }

  _flushHealthPresentationEvents() {
    if (!this.healthPresentation) return;
    for (const event of this.healthSystem.drainPresentationEvents()) {
      const entity = Array.from(this.ecsWorld.with('player')).find(
        (candidate) => candidate.player?.id === event.playerId
      );
      this.healthPresentation.handleEvent(event, {
        mesh: entity?.renderMesh?.mesh || null,
        pose: entity?.character?.pose || null,
      });
    }
  }

  _render(dt, now) {
    this.renderSystem.update(this.ecsWorld, this.localEntity, now);
    this.effectStore.update(dt, now);
    this.sceneManager.render();
    this._updateHUD();

    const velocity = this.localEntity?.physics?.velocity;
    const speed = Math.hypot(Number(velocity?.x) || 0, Number(velocity?.z) || 0);
    const input = this.localEntity?.input;
    const weapon = this.localEntity?.weapon;
    const recoil = Math.abs(Number(weapon?.cameraRecoilPitch) || 0);
    const mask = input?.inputMask || 0;
    const stance = input?.stance ?? STANCE.STAND;
    const isSprinting =
      !!(mask & INPUT_FLAGS.SPRINT) &&
      !!(mask & INPUT_FLAGS.FORWARD) &&
      stance === STANCE.STAND;

    const accuracy = getAccuracyState({
      stance,
      speed,
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

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.gameLoop?.start();
  }

  _handleClientConnect(peerId) {
    this._ensureClientEntity(peerId);
  }

  _ensureClientEntity(peerId) {
    const id = String(peerId);
    const existing = this.clientEntities.get(id);
    if (existing) return existing;

    for (const entity of this.ecsWorld.with('player')) {
      if (entity.player?.peerId === id) {
        this.clientEntities.set(id, entity);
        return entity;
      }
    }

    // Slot 0 belongs to the host. Clients start at slot 1 and wrap only
    // after all configured spawn points have been used.
    const spawnIndex = this.clientEntities.size + 1;
    const spawn = WORLD_CONFIG.PLAYER.SPAWN_POINTS[
      spawnIndex % WORLD_CONFIG.PLAYER.SPAWN_POINTS.length
    ];

    const entity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      id,
      {
        ...spawn,
        y: WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2,
      },
      false,
      false,
      this.presentationColliderRegistry
    );

    // Host-owned remote players are always renderable world entities. Keep
    // their network role explicit so later camera/visibility changes cannot
    // accidentally treat them as the host's first-person body.
    entity.networkRole = 'remote';
    entity.renderMesh.mesh.visible = true;
    entity.character?.updateVisuals?.({
      health: entity.player?.health ?? GAME_CONFIG.MAX_HEALTH,
      maxHealth: entity.player?.maxHealth ?? GAME_CONFIG.MAX_HEALTH,
      stance: entity.player?.remoteStance ?? 0,
      pitch: entity.player?.remotePitch ?? 0,
      isDead: false,
    });

    this.clientEntities.set(id, entity);
    return entity;
  }

  _announceClientEntity(id, entity) {
    if (!entity || this.announcedClients.has(id)) return;

    if (!this.networkTransport.isConnected(id)) return;

    // The world definition and spawn are sent once, before gameplay state.
    this.networkTransport.sendTo(id, Protocol.encodeWorldInit(createWorldManifest()));
    this.networkTransport.sendTo(
      id,
      Protocol.encodeJoinAccept(
        entity.player?.id ?? 0,
        entity.player?.id ?? 0,
        entity.transform?.position
      )
    );
    this.announcedClients.add(id);
  }

  _handleClientDisconnect(peerId) {
    this.hostNetworkSystem?.removePeer(peerId);

    for (const entity of this.ecsWorld.with('player')) {
      if (entity.player?.peerId !== peerId) continue;
      this.departedPlayers.set(String(peerId), {
        playerId: entity.player.id,
        displayName: normalizePlayerName(entity.player.displayName),
        kills: entity.player.kills || 0,
        deaths: entity.player.deaths || 0,
        leftAt: Date.now(),
      });
      this._removePlayerEntity(entity);
      break;
    }
  }

  async _updateMultiplayerTelemetry(now) {
    if (now - this.lastSessionTelemetryAt < NETWORK_CONFIG.MULTIPLAYER.SESSION_TELEMETRY_INTERVAL_MS) return;
    this.lastSessionTelemetryAt = now;

    const telemetry = await this.networkTransport.getAllConnectionTelemetry();
    const current = new Map();

    const host = this.localEntity?.player;
    if (host) {
      current.set('host', {
        playerId: host.id,
        displayName: this.playerName,
        isHost: true,
        status: 'online',
        health: host.health,
        kills: host.kills || 0,
        deaths: host.deaths || 0,
        pingMs: 0,
        path: 'host',
        protocol: 'local',
        connectionState: 'connected',
        lastSeen: Date.now(),
      });
    }

    for (const entity of this.ecsWorld.with('player')) {
      const player = entity.player;
      if (!player || player.isHost) continue;
      const peerId = String(player.peerId || '');
      const stats = telemetry[peerId] || {};
      current.set(peerId, {
        playerId: player.id,
        displayName: normalizePlayerName(player.displayName),
        isHost: false,
        status: stats.connected ? 'online' : 'connecting',
        health: player.health,
        kills: player.kills || 0,
        deaths: player.deaths || 0,
        pingMs: stats.pingMs ?? null,
        path: stats.path || 'unknown',
        protocol: stats.protocol || 'unknown',
        connectionState: stats.connectionState || 'unknown',
        iceState: stats.iceState || 'unknown',
        lastSeen: Date.now(),
      });
    }

    const cutoff = Date.now() - NETWORK_CONFIG.MULTIPLAYER.DISCONNECT_GRACE_MS;
    for (const [peerId, departed] of this.departedPlayers) {
      if (departed.leftAt < cutoff) {
        this.departedPlayers.delete(peerId);
        continue;
      }
      current.set(peerId, {
        ...departed,
        status: 'left',
        path: '—',
        protocol: '—',
        pingMs: null,
        connectionState: 'closed',
        lastSeen: departed.leftAt,
      });
    }

    const players = Array.from(current.values()).slice(0, NETWORK_CONFIG.MULTIPLAYER.MAX_ROSTER_PLAYERS);
    const state = {
      version: 1,
      serverTime: Date.now(),
      hostPlayerId: host?.id ?? 0,
      playerCount: players.filter((p) => p.status === 'online').length,
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      players,
    };

    this.hud.updateMultiplayerState?.(state);
    this.networkTransport.broadcast(Protocol.encodeSessionState(state));

    if (Date.now() - this.lastNetworkLogAt >= NETWORK_CONFIG.MULTIPLAYER.NETWORK_LOG_INTERVAL_MS) {
      this.lastNetworkLogAt = Date.now();
      console.info('[Multiplayer] Session telemetry', players.map((p) => ({
        name: p.displayName,
        status: p.status,
        pingMs: p.pingMs,
        path: p.path,
        protocol: p.protocol,
        connection: p.connectionState,
      })));
    }
  }

  _removePlayerEntity(entity) {
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
    const peerId = String(entity.player?.peerId ?? '');
    this.clientEntities.delete(peerId);
    this.announcedClients.delete(peerId);
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
    this.clientEntities.clear();
    this.announcedClients.clear();
    window.removeEventListener('click', this._audioUnlockHandler);
    this.gameLoop = null;
  }
}
