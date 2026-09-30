import { GAME_CONFIG, PHYSICS_CONFIG, STANCE } from '../../../config/index.js';
import { LagCompensation } from './LagCompensation.js';

export class LagCompensationSystem {
  constructor({ tickRate = 60, maxRewindMs = 200, historyTicks = 180 } = {}) {
    this.lagCompensation = new LagCompensation({ tickRate, maxRewindMs, historyTicks });
  }

  record(ecsWorld, tick) {
    const hitboxes = [];
    for (const entity of ecsWorld?.with?.('player', 'transform', 'input') || []) {
      const player = entity.player;
      const transform = entity.transform;
      if (!player || !transform || player.isDead) continue;

      const stance = entity.input?.stance ?? STANCE.STAND;
      const height = GAME_CONFIG.PLAYER_HEIGHT;
      const radius = GAME_CONFIG.PLAYER_RADIUS;
      const pose = stance === STANCE.PRONE
        ? { offsetY: PHYSICS_CONFIG.HITBOX.PRONE_OFFSET_Y, scaleY: PHYSICS_CONFIG.HITBOX.PRONE_SCALE_Y }
        : stance === STANCE.CROUCH
          ? { offsetY: PHYSICS_CONFIG.HITBOX.CROUCH_OFFSET_Y, scaleY: PHYSICS_CONFIG.HITBOX.CROUCH_SCALE_Y }
          : { offsetY: 0, scaleY: 1 };
      const scale = pose.scaleY;
      const radialScale = PHYSICS_CONFIG.HITBOX.RADIAL_BASE + PHYSICS_CONFIG.HITBOX.RADIAL_SCALE * scale;
      const headRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.HEAD_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.HEAD_MAX_RADIUS) * radialScale;
      const torsoHalfHeight = Math.max(
        PHYSICS_CONFIG.HITBOX.TORSO_MIN_HALF_HEIGHT,
        height * PHYSICS_CONFIG.HITBOX.TORSO_HALF_HEIGHT_FACTOR
      ) * scale;
      const torsoRadius = Math.min(
        radius * PHYSICS_CONFIG.HITBOX.TORSO_RADIUS_FACTOR,
        PHYSICS_CONFIG.HITBOX.TORSO_MAX_RADIUS
      ) * radialScale;

      const base = transform.position;
      hitboxes.push(
        {
          entityId: player.id,
          zone: 'head',
          position: {
            x: base.x,
            y: base.y + height * PHYSICS_CONFIG.HITBOX.HEAD_Y_FACTOR * scale + pose.offsetY +
              (scale < 1 ? PHYSICS_CONFIG.HITBOX.CROUCH_HEAD_Y_BIAS : 0),
            z: base.z,
          },
          radius: headRadius,
          yaw: transform.rotation?.yaw ?? 0,
          stance,
        },
        {
          entityId: player.id,
          zone: 'torso',
          position: {
            x: base.x,
            y: base.y + height * PHYSICS_CONFIG.HITBOX.TORSO_Y_FACTOR * scale + pose.offsetY,
            z: base.z,
          },
          radius: torsoRadius,
          halfHeight: torsoHalfHeight,
          yaw: transform.rotation?.yaw ?? 0,
          stance,
        }
      );
    }
    this.lagCompensation.record(tick, hitboxes);
  }

  resolve(args) {
    return this.lagCompensation.resolve(args);
  }

  clear() {
    this.lagCompensation.history.clear();
  }
}
