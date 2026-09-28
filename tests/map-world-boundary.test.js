import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('map ECS module contains no Three.js dependency or stale scene helper', () => {
  const source = fs.readFileSync(path.join(root, 'src/game/world/createMap.js'), 'utf8');
  assert.doesNotMatch(source, /from ['"]three['"]/);
  assert.doesNotMatch(source, /addToScene\(/);
});

test('urban assembler uses the PhysicsWorld boundary for collider creation', () => {
  const source = fs.readFileSync(path.join(root, 'src/ecs/entities/UrbanPropAssembler.js'), 'utf8');
  assert.doesNotMatch(source, /@dimforge\/rapier3d-compat/);
  assert.match(source, /physicsWorld\.createPrimitiveCollider/);
});

test('physics world exposes primitive collider construction through StaticPhysics', () => {
  const source = fs.readFileSync(path.join(root, 'src/physics/PhysicsWorld.js'), 'utf8');
  assert.match(source, /createPrimitiveCollider\(part\)/);
  assert.match(source, /this\.staticPhysics\.createPrimitiveCollider\(part\)/);
});


test('map definitions are independent of ECS, physics, and presentation', () => {
  const source = fs.readFileSync(path.join(root, 'src/game/world/MapDefinitions.js'), 'utf8');
  assert.doesNotMatch(source, /from ['"]three['"]/);
  assert.doesNotMatch(source, /@dimforge\\/rapier3d-compat/);
  assert.doesNotMatch(source, /src\\/(ecs|physics|presentation)/);
});

test('world composition lives outside ECS entity modules', () => {
  const source = fs.readFileSync(path.join(root, 'src/game/world/createMap.js'), 'utf8');
  assert.match(source, /MapObjectView/);
  assert.match(source, /addSolidMapEntity/);
  assert.doesNotMatch(source, /from ['"]three['"]/);
  assert.doesNotMatch(source, /@dimforge\\/rapier3d-compat/);
});
