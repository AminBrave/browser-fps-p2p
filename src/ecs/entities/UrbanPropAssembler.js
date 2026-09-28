// src/ecs/entities/UrbanPropAssembler.js
//
// ECS/physics assembly for urban props. No rendering or scene dependencies.

import RAPIER from '@dimforge/rapier3d-compat';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';

function primitiveCollider(part) {
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
  desc.setTranslation(part.position?.x || 0, part.position?.y || 0, part.position?.z || 0);
  if (part.rotationQuaternion) desc.setRotation(part.rotationQuaternion);
  return desc;
}

export function addUrbanProp(ecsWorld, physicsWorld, mapEntities, spec, view) {
  const parts = spec.parts.map((part, index) => ({
    desc: primitiveCollider(part),
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
