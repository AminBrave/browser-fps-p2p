import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('urban ECS assembler has no rendering or Rapier implementation dependency', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/ecs/entities/UrbanPropAssembler.js'),
    'utf8'
  );

  assert.doesNotMatch(source, /from ['"]three['"]/);
  assert.doesNotMatch(source, /from ['"]@dimforge\/rapier3d-compat['"]/);
  assert.doesNotMatch(source, /sceneManager/);
  assert.match(source, /physicsWorld\.createPrimitiveCollider/);
});

test('urban definitions remain independent of ECS, physics, and presentation modules', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/game/world/UrbanPropDefinitions.js'),
    'utf8'
  );

  assert.doesNotMatch(source, /from ['"]three['"]/);
  assert.doesNotMatch(source, /@dimforge\/rapier3d-compat/);
  assert.doesNotMatch(source, /src\/ecs|src\/physics|src\/presentation/);
});
