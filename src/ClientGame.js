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

    this.interpolationSystem.addSnapshot(snapshot);

    // Store the newest snapshot; body/physics changes are applied by\n    // _fixedUpdate() so Rapier is never mutated from an async network event.\n    this._pendingSnapshot = snapshot;
  }

  _handleGameEvent(event) {
    if (!event) return;
    const localId = this.localEntity?.player?.id;
    if (event.shooterId === localId) return;
    if (
      event.type === EVENT_TYPES.SFX &&
      event.sourceId === localId &&
      ['reloadStart', 'reloadEnd', 'footstep', 'jump', 'land'].includes(event.sfx)
    ) {
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
