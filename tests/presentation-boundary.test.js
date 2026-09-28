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
  assert.equal(fs.existsSync(path.join(root, 'src/presentation/effects/TracerEffects.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/ecs/systems/RenderSystem.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/ecs/systems/ImpactSystem.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/ecs/entities/createBullet.js')), false);
});

test('presentation impact code is the only owner of Three.js impact construction', () => {
  assert.match(read('src/presentation/effects/TracerEffects.js'), /from ['"]three['"]/);
  assert.match(read('src/presentation/impact/ImpactSystem.js'), /from ['"]three['"]/);
  assert.doesNotMatch(read('src/ecs/entities/PlayerEntityAssembler.js'), /from ['"]three['"]/);
  assert.doesNotMatch(read('src/ecs/entities/MapEntityAssembler.js'), /from ['"]three['"]/);
  assert.doesNotMatch(read('src/ecs/entities/UrbanPropAssembler.js'), /from ['"]three['"]/);
});


test('transient tracer creation does not depend on ECS', () => {
  const effects = read('src/presentation/effects/TracerEffects.js');
  assert.match(effects, /effectStore/);
  assert.doesNotMatch(effects, /ecsWorld/);
  const renderer = read('src/presentation/render/RenderSystem.js');
  assert.doesNotMatch(renderer, /entity\.lifespan/);
  assert.doesNotMatch(renderer, /ecsWorld\.remove\(entity\)/);
});


test('impact presentation owns visual lifecycle without ECS access', () => {
  const impact = read('src/presentation/impact/ImpactSystem.js');
  assert.doesNotMatch(impact, /ecsWorld/);
  assert.match(impact, /PresentationEffectStore|effectStore/);
  const health = read('src/presentation/health/HealthPresentation.js');
  assert.doesNotMatch(health, /ImpactEffects/);
  const healthSystem = read('src/ecs/systems/HealthSystem.js');
  assert.doesNotMatch(healthSystem, /ImpactEffects/);
});


test('impact presentation is split into construction, animation, and orchestration', () => {
  const factory = read('src/presentation/impact/ImpactVisualFactory.js');
  const animator = read('src/presentation/impact/ImpactEffectAnimator.js');
  const system = read('src/presentation/impact/ImpactSystem.js');
  assert.match(factory, /from ['"]three['"]/);
  assert.match(factory, /createSurfaceImpact/);
  assert.match(animator, /update\(/);
  assert.match(animator, /updatePlayerImpactMarksForHealth/);
  assert.doesNotMatch(factory, /effectStore/);
  assert.doesNotMatch(animator, /spawnSurfaceImpact|new THREE\.(Group|Mesh)/);
  assert.doesNotMatch(system, /from ['"]three['"]/);
  assert.doesNotMatch(system, /new THREE\./);
  assert.match(system, /ImpactVisualFactory/);
  assert.match(system, /ImpactEffectAnimator/);
});
