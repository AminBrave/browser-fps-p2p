import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';

/**
 * Assembles static map ECS entities and registers their gameplay/presentation
 * collider metadata. Rendering construction stays outside this module.
 */
export function addSolidMapEntity(
  ecsWorld,
  physicsWorld,
  mapEntities,
  { position, physics, mesh, name, boundary = false, colliders = [], rotationY = 0, presentationTargets = [] }
) {
  mesh.name = name || mesh.name || 'world-object';
  mesh.visible = !boundary;

  const entity = ecsWorld.add({
    isMap: true,
    isBoundary: boundary,
    isSolid: true,
    transform: createTransform(position.x, position.y, position.z, rotationY),
    physics: {
      ...createPhysics(physics.body, physics.collider),
      colliders: [...(physics.colliders || [physics.collider]), ...colliders],
    },
    renderMesh: { mesh },
  });

  const physicsColliders = physics.colliders || [physics.collider];
  for (let i = 0; i < physicsColliders.length; i++) {
    physicsWorld.registerColliderEntity(
      physicsColliders[i],
      entity,
      physics.hitZones?.[i] || null,
      physics.colliderMaterials?.[i] || null
    );
  }
  for (const collider of colliders) {
    physicsWorld.registerColliderEntity(collider, entity, null, 'default');
  }

  const presentationBindings = mapEntities.presentationColliderRegistry;
  for (let i = 0; i < physicsColliders.length; i++) {
    const target = presentationTargets[i] || null;
    if (target) presentationBindings?.register(physicsColliders[i], target);
  }

  mapEntities.push(entity);
  return entity;
}
