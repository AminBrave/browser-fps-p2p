import { GAME_CONFIG, NETWORK_CONFIG } from '../../../config/index.js';

/**
 * Client-only snapshot interpolation.
 *
 * Snapshots are indexed by entity id for O(players) interpolation rather than
 * performing an Array.find for every entity on every render frame.
 */
export class InterpolationSystem {
  constructor(renderDelayMs) {
    this.renderDelayMs =
      renderDelayMs ??
      GAME_CONFIG.INTERPOLATION_DELAY_MS ??
      NETWORK_CONFIG.INTERPOLATION_BUFFER_MS ??
      100;

    this.snapshotBuffer = [];
    this.maxSnapshots = Math.max(8, NETWORK_CONFIG.MAX_SNAPSHOT_HISTORY || Math.ceil((this.renderDelayMs / 1000) * NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE) + 4);
  }

  addSnapshot(snapshot) {
    if (!snapshot) return;

    const timestamp =
      typeof snapshot.timestamp === 'number'
        ? snapshot.timestamp
        : performance.now();

    const normalized = {
      ...snapshot,
      timestamp,
      players: snapshot.players || snapshot.entities || [],
    };

    const last = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    if (last && timestamp <= last.timestamp) return;

    this.snapshotBuffer.push(normalized);
    if (this.snapshotBuffer.length > this.maxSnapshots) {
      this.snapshotBuffer.splice(
        0,
        this.snapshotBuffer.length - this.maxSnapshots
      );
    }
  }

  update(ecsWorld, playerEntities, localEntity, _currentTime) {
    // Render the newest authoritative snapshot. This intentionally does not
    // introduce an artificial 100 ms world-position offset: a remote player's
    // displayed coordinates must correspond to the same server snapshot that
    // the host used. Network latency still exists, but it is no longer hidden
    // behind a second, client-only simulation timeline.
    const snapshot = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    if (!snapshot) return;

    const playersById = this._indexPlayers(snapshot.players);

    for (const entity of playerEntities || []) {
      if (!entity || entity === localEntity) continue;
      const player = entity.player;
      const transform = entity.transform;
      if (!player || !transform || player.isLocal) continue;

      const state = playersById.get(player.id);
      if (!state) continue;

      const x = state.x ?? state.position?.x ?? 0;
      const y = state.y ?? state.position?.y ?? 0;
      const z = state.z ?? state.position?.z ?? 0;

      transform.position.x = x;
      transform.position.y = y;
      transform.position.z = z;

      // Remote hitboxes/raycast targets must occupy the exact same server
      // coordinate as the visible remote player.
      entity.physics?.rigidBody?.setTranslation?.({ x, y, z }, true);

      const yaw = state.yaw ?? state.rotation?.yaw ?? 0;
      const pitch = state.pitch ?? state.rotation?.pitch ?? 0;
      if (transform.rotation) {
        transform.rotation.yaw = yaw;
        transform.rotation.pitch = pitch;
      }

      const stance = state.stance ?? 0;
      const weaponId = state.weaponId ?? 1;
      player.remoteStance = stance;
      player.remotePitch = pitch;
      player.remoteWeaponId = weaponId;
      player.isDead = !!state.isDead;
      if (state.health !== undefined) {
        player.health = state.health;
        player.isDead = player.health <= 0 || player.isDead;
      }

      entity.input.stance = stance;
      entity.input.pitch = pitch;
      entity.character?.setWeaponType?.(weaponId);
    }
  }

  _indexPlayers(players) {
    const map = new Map();
    for (const player of players || []) {
      const id = player?.id ?? player?.entityId;
      if (id != null) map.set(id, player);
    }
    return map;
  }

  _lerpAngle(from, to, alpha) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * alpha;
  }

  dispose() {
    this.snapshotBuffer.length = 0;
  }
}
