import { GAME_CONFIG, NETWORK_CONFIG } from '../../../config/index.js';
import { insertSnapshot, sampleSnapshotPair, lerpAngle } from '../../../game/simulation/network/SnapshotTimeline.js';

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
    this.serverClockOffsetMs = null;
    this.maxSnapshots = Math.max(8, NETWORK_CONFIG.MAX_SNAPSHOT_HISTORY || Math.ceil((this.renderDelayMs / 1000) * NETWORK_CONFIG.SNAPSHOT_BROADCAST_RATE) + 4);
  }

  addSnapshot(snapshot) {
    if (!snapshot) return;

    const arrivalTime = performance.now();
    const tickRate = Math.max(1, NETWORK_CONFIG.SERVER_TICK_RATE || 60);
    const serverTime =
      Number.isFinite(snapshot.serverTick)
        ? (Number(snapshot.serverTick) / tickRate) * 1000
        : arrivalTime;

    // Map the host's simulation clock onto this client's monotonic clock once,
    // then keep using server ticks. Packet arrival jitter therefore does not
    // change the spacing between snapshots.
    // Establish the server->client clock mapping once. Re-estimating the
    // offset for every packet moves the interpolation timeline underneath
    // already-buffered snapshots and can create tiny visible changes in alpha.
    // Server ticks already provide a stable simulation timeline.
    if (this.serverClockOffsetMs == null) {
      this.serverClockOffsetMs = arrivalTime - serverTime;
    }

    const timestamp = serverTime + this.serverClockOffsetMs;

    const normalized = {
      ...snapshot,
      timestamp,
      players: snapshot.players || snapshot.entities || [],
    };

    insertSnapshot(this.snapshotBuffer, normalized, this.maxSnapshots);
  }

  update(ecsWorld, playerEntities, localEntity, _currentTime) {
    if (this.snapshotBuffer.length === 0) return;

    // Remote players are rendered from a short server-history delay. Packet
    // arrival jitter is absorbed by interpolation rather than shown as 30 Hz
    // teleports. The local player remains client-predicted.
    const targetTime = (typeof _currentTime === 'number' ? _currentTime : performance.now()) - this.renderDelayMs;
    const sample = sampleSnapshotPair(this.snapshotBuffer, targetTime);
    if (!sample) return;
    const { older, newer, alpha } = sample;
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

      // The Rapier remote body is intentionally NOT moved to this delayed
      // render position. _syncRemoteEntities() keeps the collision/hitbox body
      // at the newest authoritative server state; this transform is visual only.
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
    return lerpAngle(from, to, alpha);
  }

  dispose() {
    this.snapshotBuffer.length = 0;
  }
}
