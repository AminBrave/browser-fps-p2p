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
    if (this.snapshotBuffer.length === 0) return;

    // Remote players are rendered from a short server-history delay. Packet
    // arrival jitter is absorbed by interpolation rather than shown as 30 Hz
    // teleports. The local player remains client-predicted.
    const targetTime = (typeof _currentTime === 'number' ? _currentTime : performance.now()) - this.renderDelayMs;
    let older = this.snapshotBuffer[0];
    let newer = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
      if (this.snapshotBuffer[i].timestamp <= targetTime) {
        older = this.snapshotBuffer[i];
        newer = this.snapshotBuffer[Math.min(i + 1, this.snapshotBuffer.length - 1)];
        break;
      }
    }
    const span = Math.max(1, newer.timestamp - older.timestamp);
    const alpha = Math.max(0, Math.min(1, (targetTime - older.timestamp) / span));
    const olderById = this._indexPlayers(older.players);
    const newerById = this._indexPlayers(newer.players);

    for (const entity of playerEntities || []) {
      if (!entity || entity === localEntity) continue;
      const player = entity.player;
      const transform = entity.transform;
      if (!player || !transform || player.isLocal) continue;

      const a = olderById.get(player.id) || newerById.get(player.id);
      const b = newerById.get(player.id) || a;
      if (!a || !b) continue;
      const ax = a.x ?? a.position?.x ?? 0, bx = b.x ?? b.position?.x ?? ax;
      const ay = a.y ?? a.position?.y ?? 0, by = b.y ?? b.position?.y ?? ay;
      const az = a.z ?? a.position?.z ?? 0, bz = b.z ?? b.position?.z ?? az;
      const x = ax + (bx - ax) * alpha;
      const y = ay + (by - ay) * alpha;
      const z = az + (bz - az) * alpha;
      const state = b;

      transform.position.x = x;
      transform.position.y = y;
      transform.position.z = z;

      // Remote hitboxes/raycast targets must occupy the exact same server
      // coordinate as the visible remote player.
      entity.physics?.rigidBody?.setTranslation?.({ x, y, z }, true);

      const yaw = a.yaw != null && b.yaw != null ? this._lerpAngle(a.yaw, b.yaw, alpha) : (state.yaw ?? state.rotation?.yaw ?? 0);
      const pitch = (a.pitch ?? 0) + ((b.pitch ?? 0) - (a.pitch ?? 0)) * alpha;
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
