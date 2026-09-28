import { GAME_CONFIG, PLAYER_CONFIG, NETWORK_CONFIG, STANCE, INPUT_FLAGS, WORLD_CONFIG, validateConfig } from './config/index.js';
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
import { GameLoop } from './core/GameLoop.js';
import { audio } from './audio/AudioManager.js';
import { getAccuracyState } from './utils/AccuracyModel.js';
import { disposeImpactDecals } from './ecs/entities/createBullet.js';
import { ImpactSystem } from './ecs/systems/ImpactSystem.js';
import { Protocol } from './network/Protocol.js';
import { createWorldManifest } from './network/WorldSync.js';

export class HostGame {
  constructor(containerElement) {
    this.container = containerElement;
    this.ecsWorld = new World();
    this.physicsWorld = new PhysicsWorld();
    this.sceneManager = new SceneManager(this.container);
    this.impactSystem = new ImpactSystem(this.ecsWorld, this.sceneManager);
    this.peerManager = new PeerManager();
    this.hud = new HUD();

    this.localPlayerId = 'host-player';
    this.localEntity = null;
    this.clientEntities = new Map();
    this.announcedClients = new Set();
    this.isRunning = false;

    this.fixedDeltaTime =
      1 / (NETWORK_CONFIG.SERVER_TICK_RATE || PLAYER_CONFIG.TICK_RATE || 60);

    this._audioUnlockHandler = () => audio.unlock();
    window.addEventListener('click', this._audioUnlockHandler);
  }

  async initialize() {
    validateConfig();
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
      this.renderSystem,
      null,
      this.impactSystem
    );
    this.hostNetworkSystem = new HostNetworkSystem(this.peerManager);
    this.hostNetworkSystem.setJoinHandler((peerId) => {
      const entity = this._ensureClientEntity(peerId);
      this._announceClientEntity(peerId, entity);
    });
    this.healthSystem.setEventSink((event) => this.hostNetworkSystem.emitGameEvent(event));
    this.weaponSystem.setEventSink((event) => this.hostNetworkSystem.emitGameEvent(event));
    this.renderSystem.setEventSink((event) => this.hostNetworkSystem.emitGameEvent(event));

    createMap(this.ecsWorld, this.physicsWorld, this.sceneManager);

    this.localEntity = createPlayer(
      this.ecsWorld,
      this.physicsWorld,
      this.sceneManager,
      this.localPlayerId,
      { ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[0], y: WORLD_CONFIG.GROUND_Y + PLAYER_CONFIG.HEIGHT / 2 },
      true,
      true
    );

    const hostRoomId = await this.peerManager.initHost();
    this.invitationCode = String(hostRoomId).toUpperCase();
    this.peerManager.onConnect((id) => this._handleClientConnect(id));
    this.peerManager.onDisconnect((id) => this._handleClientDisconnect(id));

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
    for (const peerId of this.peerManager.connections.keys()) {
      this._ensureClientEntity(peerId);
    }

    this.inputSystem.sample(this.ecsWorld, this.localEntity);
    this.hostNetworkSystem.preUpdate(this.ecsWorld);

    this.physicsSystem.update(this.ecsWorld, dt);
    this.weaponSystem.update(this.ecsWorld, performance.now(), dt);
    this.healthSystem.update(this.ecsWorld);
    this.renderSystem.captureFixedState(this.localEntity);
    // Network snapshots are emitted on the fixed tick, after Rapier commits
    // movement, so every snapshot describes an actual authoritative state.
    this.hostNetworkSystem.postUpdate(this.ecsWorld, performance.now());
  }

  _render(dt, now) {
    this.renderSystem.update(this.ecsWorld, this.localEntity, now);
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
      false
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

    const connection = this.peerManager.connections.get(id);
    if (!connection?.open) return;

    // The world definition and spawn are sent once, before gameplay state.
    this.peerManager.sendTo(id, Protocol.encodeWorldInit(createWorldManifest()));
    this.peerManager.sendTo(
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
      this._removePlayerEntity(entity);
      break;
    }
  }

  _removePlayerEntity(entity) {
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
    disposeImpactDecals(this.ecsWorld);
    this.sceneManager.dispose();
    this.physicsWorld.dispose();
    this.peerManager.destroy();
    this.clientEntities.clear();
    this.announcedClients.clear();
    window.removeEventListener('click', this._audioUnlockHandler);
    this.gameLoop = null;
  }
}
