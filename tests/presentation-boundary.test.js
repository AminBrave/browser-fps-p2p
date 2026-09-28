import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('render and impact systems live in presentation', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/presentation/render/RenderSystem.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/presentation/impact/ImpactSystem.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/presentation/impact/ImpactEffects.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/ecs/systems/RenderSystem.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/ecs/systems/ImpactSystem.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/ecs/entities/createBullet.js')), false);
});

test('presentation impact code is the only owner of Three.js impact construction', () => {
  assert.match(read('src/presentation/impact/ImpactEffects.js'), /from ['"]three['"]/);
  assert.match(read('src/presentation/impact/ImpactSystem.js'), /from ['"]three['"]/);
  assert.doesNotMatch(read('src/ecs/entities/PlayerEntityAssembler.js'), /from ['"]three['"]/);
  assert.doesNotMatch(read('src/ecs/entities/MapEntityAssembler.js'), /from ['"]three['"]/);
  assert.doesNotMatch(read('src/ecs/entities/UrbanPropAssembler.js'), /from ['"]three['"]/);
});
