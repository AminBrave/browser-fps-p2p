import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('player ECS assembler has no rendering dependency', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/ecs/entities/PlayerEntityAssembler.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /from ['"]three['"]/);
  assert.doesNotMatch(source, /src/presentation/);
});

test('player composition owns presentation construction outside ECS', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/game/player/createPlayer.js'),
    'utf8'
  );
  assert.match(source, /createPlayerCharacter/);
  assert.match(source, /addPlayerEntity/);
});
