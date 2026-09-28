// src/ecs/entities/UrbanPropAssembler.js
//
// ECS/physics assembly for urban props. No rendering or scene dependencies.

import RAPIER from '@dimforge/rapier3d-compat';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';

export function addUrbanProp(ecsWorld, physicsWorld, mapEntities, spec, view) {
  const parts = spec.parts.map((part, index) => ({
    desc: physicsWorld.createPrimitiveCollider(part),
    materialType: view.parts[index].materialType,
  }));
  const physics = physicsWorld.createStaticCompound(
    spec.x,
    spec.groundY,
    spec.z,
    parts,
    spec.rotationY || 0
  );

  const entity = ecsWorld.add({
    isMap: true,
    isSolid: true,
    isUrbanObject: true,
    urbanType: spec.type,
    transform: createTransform(spec.x, spec.groundY, spec.z, spec.rotationY || 0),
    physics: {
      ...createPhysics(physics.body, physics.collider),
      colliders: physics.colliders,
    },
    renderMesh: { mesh: view.root },
  });

  for (let i = 0; i < physics.colliders.length; i++) {
    physicsWorld.registerColliderEntity(
      physics.colliders[i],
      entity,
      physics.hitZones?.[i] || null,
      physics.colliderMaterials?.[i] || null
    );
    const target = view.parts[i]?.mesh || null;
    if (target) mapEntities.presentationColliderRegistry?.register(physics.colliders[i], target);
  }

  mapEntities.push(entity);
  return entity;
}
