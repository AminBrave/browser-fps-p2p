import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Static collision construction boundary.
 *
 * Owns fixed map/prop bodies and their collider descriptors. World lifetime
 * remains owned by PhysicsWorld.
 */
export class StaticPhysics {
  constructor(getWorld) {
    this.getWorld = getWorld;
  }

  createPrimitiveCollider(part) {
    let desc;
    switch (part.kind) {
      case 'box':
        desc = RAPIER.ColliderDesc.cuboid(part.size.x / 2, part.size.y / 2, part.size.z / 2);
        break;
      case 'cylinder':
        desc = RAPIER.ColliderDesc.cylinder(part.height / 2, part.radius);
        break;
      case 'cone':
        desc = RAPIER.ColliderDesc.cone(part.height / 2, part.radius);
        break;
      default:
        desc = RAPIER.ColliderDesc.ball(part.radius);
        break;
    }
    desc.setTranslation(part.position?.x ?? 0, part.position?.y ?? 0, part.position?.z ?? 0);
    if (part.rotationQuaternion) desc.setRotation(part.rotationQuaternion);
    return desc;
  }

  createStaticBox(x, y, z, hx, hy, hz, rotationY = 0, materialType = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cuboid(hx, hy, hz), materialType }],
      rotationY
    );
  }

  createStaticCompound(x, y, z, parts, rotationY = 0) {
    const world = this.getWorld();
    if (!world) throw new Error('Physics world is not initialized');
    if (!parts?.length) throw new Error('Static compound requires at least one part');

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation(this._yawQuaternion(rotationY))
    );

    const colliders = parts.map((part) => {
      const desc = part.desc ? part.desc : new RAPIER.ColliderDesc(part.shape);
      desc.setTranslation(part.position?.x ?? 0, part.position?.y ?? 0, part.position?.z ?? 0);
      if (part.rotation) desc.setRotation(part.rotation);
      return world.createCollider(desc, body);
    });

    return {
      body,
      collider: colliders[0],
      colliders,
      hitZones: parts.map((part) => part.hitZone || null),
      colliderMaterials: parts.map((part) => part.materialType || null),
    };
  }

  createStaticCone(x, y, z, radius, height, rotationY = 0, materialType = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cone(height / 2, radius), materialType }],
      rotationY
    );
  }

  createStaticCylinder(x, y, z, radius, height, rotationY = 0, materialType = null) {
    return this.createStaticCompound(
      x, y, z,
      [{ desc: RAPIER.ColliderDesc.cylinder(height / 2, radius), materialType }],
      rotationY
    );
  }

  _yawQuaternion(rotationY = 0) {
    return { x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) };
  }
}
