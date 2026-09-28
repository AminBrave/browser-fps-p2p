import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, PHYSICS_CONFIG, STANCE } from '../config/index.js';

/**
 * Character-specific Rapier construction and stance geometry.
 *
 * This owns player colliders/controllers, while PhysicsWorld owns the world
 * lifetime and delegates character creation to this boundary.
 */
export class CharacterPhysics {
  constructor(getWorld) {
    this.getWorld = getWorld;
  }

  createPlayerBody(x, y, z, radius = PHYSICS_CONFIG.DEFAULT_PLAYER_RADIUS, height = PHYSICS_CONFIG.DEFAULT_PLAYER_HEIGHT) {
    if (!this.getWorld()) throw new Error('Physics world is not initialized');

    const body = this.getWorld().createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
    );

    // Player locomotion uses one compound rigid body. Bullet queries hit the
    // individual anatomical colliders, so the visual surface, impact point and
    // damage zone can all refer to the same part.
    // The locomotion capsule is the authoritative solid envelope: exactly
    // PLAYER_HEIGHT high and PLAYER_RADIUS wide. Anatomical hit colliders are
    // separate so movement solidity and hit-zone precision cannot conflict.
    const movementRadius = Math.min(radius, height * PHYSICS_CONFIG.MOVEMENT_RADIUS_FACTOR);
    const movementHalfSegment = Math.max(PHYSICS_CONFIG.MIN_MOVEMENT_HALF_SEGMENT, height / 2 - movementRadius);
    const { WORLD: WORLD_GROUP, PLAYER_SOLID: PLAYER_SOLID_GROUP, HITBOX: HITBOX_GROUP } = PHYSICS_CONFIG.COLLISION_GROUPS;

    const movementCollider = this.getWorld().createCollider(
      RAPIER.ColliderDesc.capsule(movementHalfSegment, movementRadius),
      body
    );
    // Locomotion colliders collide only with the static world. Remote players
    // therefore cannot physically push/unstick/tunnel local players.
    movementCollider.setCollisionGroups?.(
      (PLAYER_SOLID_GROUP << 16) | WORLD_GROUP
    );

    const torsoHalfHeight = Math.max(PHYSICS_CONFIG.HITBOX.TORSO_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.TORSO_HALF_HEIGHT_FACTOR);
    const torsoRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.TORSO_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.TORSO_MAX_RADIUS);
    const headRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.HEAD_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.HEAD_MAX_RADIUS);
    const torso = this.getWorld().createCollider(
      RAPIER.ColliderDesc.capsule(torsoHalfHeight, torsoRadius)
        .setTranslation(0, height * PHYSICS_CONFIG.HITBOX.TORSO_Y_FACTOR, 0),
      body
    );
    const head = this.getWorld().createCollider(
      RAPIER.ColliderDesc.ball(headRadius)
        .setTranslation(0, height * PHYSICS_CONFIG.HITBOX.HEAD_Y_FACTOR, 0),
      body
    );

    const limbRadius = Math.max(PHYSICS_CONFIG.HITBOX.LIMB_MIN_RADIUS, radius * PHYSICS_CONFIG.HITBOX.LIMB_RADIUS_FACTOR);
    const armHalf = Math.max(PHYSICS_CONFIG.HITBOX.ARM_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.ARM_HALF_HEIGHT_FACTOR);
    const legHalf = Math.max(PHYSICS_CONFIG.HITBOX.LEG_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.LEG_HALF_HEIGHT_FACTOR);
    const armX = radius * PHYSICS_CONFIG.HITBOX.ARM_X_FACTOR;
    const legX = radius * PHYSICS_CONFIG.HITBOX.LEG_X_FACTOR;

    const leftArm = this.getWorld().createCollider(
      RAPIER.ColliderDesc.capsule(armHalf, limbRadius)
        .setTranslation(-armX, height * PHYSICS_CONFIG.HITBOX.ARM_Y_FACTOR, 0),
      body
    );
    const rightArm = this.getWorld().createCollider(
      RAPIER.ColliderDesc.capsule(armHalf, limbRadius)
        .setTranslation(armX, height * 0.02, 0),
      body
    );
    const leftLeg = this.getWorld().createCollider(
      RAPIER.ColliderDesc.capsule(legHalf, limbRadius)
        .setTranslation(-legX, height * PHYSICS_CONFIG.HITBOX.LEG_Y_FACTOR, 0),
      body
    );
    const rightLeg = this.getWorld().createCollider(
      RAPIER.ColliderDesc.capsule(legHalf, limbRadius)
        .setTranslation(legX, -height * 0.38, 0),
      body
    );

    const colliders = [movementCollider, torso, head, leftArm, rightArm, leftLeg, rightLeg];
    const hitZones = [null, 'torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

    // Hitboxes are query targets, not physical obstacles. Sensors still
    // participate in ray-casts, but cannot disturb character locomotion.
    for (const hitbox of [torso, head, leftArm, rightArm, leftLeg, rightLeg]) {
      hitbox.setSensor?.(true);
      hitbox.setCollisionGroups?.(HITBOX_GROUP << 16);
    }

    // Character controller uses the full-height movement envelope; anatomical
    // colliders remain the authoritative bullet hit geometry.
    const controller = this.getWorld().createCharacterController(PHYSICS_CONFIG.CONTROLLER.OFFSET);
    controller.enableAutostep(PHYSICS_CONFIG.CONTROLLER.AUTOSTEP_HEIGHT, PHYSICS_CONFIG.CONTROLLER.AUTOSTEP_WIDTH, true);
    controller.enableSnapToGround(PHYSICS_CONFIG.CONTROLLER.SNAP_TO_GROUND_DISTANCE);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });

    return { body, collider: movementCollider, colliders, hitZones, controller };
  }

  updatePlayerHitZones(physics, stance = 0) {
    const colliders = physics?.colliders;
    if (!colliders || colliders.length < 7) return;

    const height = GAME_CONFIG.PLAYER_HEIGHT;
    const radius = GAME_CONFIG.PLAYER_RADIUS;
    const pose = stance === STANCE.PRONE
      ? { offsetY: PHYSICS_CONFIG.HITBOX.PRONE_OFFSET_Y, scaleY: PHYSICS_CONFIG.HITBOX.PRONE_SCALE_Y }
      : stance === STANCE.CROUCH
        ? { offsetY: PHYSICS_CONFIG.HITBOX.CROUCH_OFFSET_Y, scaleY: PHYSICS_CONFIG.HITBOX.CROUCH_SCALE_Y }
        : { offsetY: 0, scaleY: 1 };
    const scale = pose.scaleY;
    const radialScale = PHYSICS_CONFIG.HITBOX.RADIAL_BASE + PHYSICS_CONFIG.HITBOX.RADIAL_SCALE * scale;

    const torsoHalf = Math.max(PHYSICS_CONFIG.HITBOX.TORSO_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.TORSO_HALF_HEIGHT_FACTOR) * scale;
    const torsoRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.TORSO_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.TORSO_MAX_RADIUS) * radialScale;
    const headRadius = Math.min(radius * PHYSICS_CONFIG.HITBOX.HEAD_RADIUS_FACTOR, PHYSICS_CONFIG.HITBOX.HEAD_MAX_RADIUS) * radialScale;
    const limbRadius = Math.max(PHYSICS_CONFIG.HITBOX.LIMB_MIN_RADIUS, radius * PHYSICS_CONFIG.HITBOX.LIMB_RADIUS_FACTOR) * radialScale;
    const armHalf = Math.max(PHYSICS_CONFIG.HITBOX.ARM_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.ARM_HALF_HEIGHT_FACTOR) * scale;
    const legHalf = Math.max(PHYSICS_CONFIG.HITBOX.LEG_MIN_HALF_HEIGHT, height * PHYSICS_CONFIG.HITBOX.LEG_HALF_HEIGHT_FACTOR) * scale;
    const armX = radius * PHYSICS_CONFIG.HITBOX.ARM_X_FACTOR * radialScale;
    const legX = radius * PHYSICS_CONFIG.HITBOX.LEG_X_FACTOR * radialScale;

    const setCapsule = (collider, halfHeight, r, x, y, z = 0) => {
      collider?.setHalfHeight?.(halfHeight);
      collider?.setRadius?.(r);
      collider?.setTranslationWrtParent?.({ x, y, z });
    };
    const setBall = (collider, r, x, y, z = 0) => {
      collider?.setRadius?.(r);
      collider?.setTranslationWrtParent?.({ x, y, z });
    };

    setCapsule(colliders[1], torsoHalf, torsoRadius, 0, height * PHYSICS_CONFIG.HITBOX.TORSO_Y_FACTOR * scale + pose.offsetY);
    setBall(colliders[2], headRadius, 0, height * PHYSICS_CONFIG.HITBOX.HEAD_Y_FACTOR * scale + pose.offsetY + (scale < 1 ? PHYSICS_CONFIG.HITBOX.CROUCH_HEAD_Y_BIAS : 0));
    setCapsule(colliders[3], armHalf, limbRadius, -armX, height * PHYSICS_CONFIG.HITBOX.ARM_Y_FACTOR * scale + pose.offsetY);
    setCapsule(colliders[4], armHalf, limbRadius, armX, height * PHYSICS_CONFIG.HITBOX.ARM_Y_FACTOR * scale + pose.offsetY);
    setCapsule(colliders[5], legHalf, limbRadius, -legX, height * PHYSICS_CONFIG.HITBOX.LEG_Y_FACTOR * scale + pose.offsetY);
    setCapsule(colliders[6], legHalf, limbRadius, legX, height * PHYSICS_CONFIG.HITBOX.LEG_Y_FACTOR * scale + pose.offsetY);
  }
}
