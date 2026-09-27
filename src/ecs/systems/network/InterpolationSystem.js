import { GAME_CONFIG, NETWORK_CONFIG } from '../../../config/constants.js';

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
    this.maxSnapshots = 30;
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

  update(ecsWorld, playerEntities, localEntity, currentTime) {
    if (this.snapshotBuffer.length < 2) return;

    const renderTime = currentTime - this.renderDelayMs;

    while (
      this.snapshotBuffer.length > 2 &&
      this.snapshotBuffer[1].timestamp <= renderTime
    ) {
      this.snapshotBuffer.shift();
    }

    const from = this.snapshotBuffer[0];
    const to = this.snapshotBuffer[1];
    if (!from || !to || from.timestamp >= to.timestamp) return;

    const alpha = Math.max(
      0,
      Math.min(
        1,
        (renderTime - from.timestamp) / (to.timestamp - from.timestamp)
      )
    );

    const fromById = this._indexPlayers(from.players);
    const toById = this._indexPlayers(to.players);

    for (const entity of playerEntities || []) {
      if (!entity || entity === localEntity) continue;
      const player = entity.player;
      const transform = entity.transform;
      if (!player || !transform || player.isLocal) continue;

      const before = fromById.get(player.id);
      const after = toById.get(player.id);
      if (!before || !after) continue;

      const fx = before.x ?? before.position?.x ?? 0;
      const fy = before.y ?? before.position?.y ?? 0;
      const fz = before.z ?? before.position?.z ?? 0;
      const tx = after.x ?? after.position?.x ?? 0;
      const ty = after.y ?? after.position?.y ?? 0;
      const tz = after.z ?? after.position?.z ?? 0;

      const x = fx + (tx - fx) * alpha;
      const y = fy + (ty - fy) * alpha;
      const z = fz + (tz - fz) * alpha;

      transform.position.x = x;
      transform.position.y = y;
      transform.position.z = z;

      // Keep the remote physics proxy aligned with the rendered transform.
      // This prevents client-side raycasts from using the original spawn point.
      entity.physics?.rigidBody?.setTranslation?.({ x, y, z }, true);

      const yawFrom = before.yaw ?? before.rotation?.yaw ?? 0;
      const yawTo = after.yaw ?? after.rotation?.yaw ?? 0;
      const pitchFrom = before.pitch ?? before.rotation?.pitch ?? 0;
      const pitchTo = after.pitch ?? after.rotation?.pitch ?? 0;
      if (transform.rotation) {
        transform.rotation.yaw = this._lerpAngle(yawFrom, yawTo, alpha);
        transform.rotation.pitch = pitchFrom + (pitchTo - pitchFrom) * alpha;
      }

      const stance = alpha < 0.5
        ? (before.stance ?? 0)
        : (after.stance ?? 0);
      const weaponId = alpha < 0.5
        ? (before.weaponId ?? 1)
        : (after.weaponId ?? 1);

      player.remoteStance = stance;
      player.remotePitch = pitchFrom + (pitchTo - pitchFrom) * alpha;
      player.remoteWeaponId = weaponId;
      player.isDead = !!(alpha < 0.5 ? before.isDead : after.isDead);

      if (after.health !== undefined) {
        player.health = after.health;
        player.isDead = player.health <= 0 || player.isDead;
      }
      entity.input.stance = stance;
      entity.input.pitch = player.remotePitch;
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
