import test from 'node:test';
import assert from 'node:assert/strict';
import { raySphere, rayVerticalCapsule, nearestHistoricalHit } from '../../src/game/simulation/combat/RayGeometry.js';

const dir = { x: 0, y: 0, z: -1 };

test('raySphere returns nearest forward intersection', () => {
  assert.equal(raySphere({x:0,y:0,z:5}, dir, {x:0,y:0,z:0}, 1).distance, 4);
  assert.equal(raySphere({x:0,y:0,z:5}, dir, {x:10,y:0,z:0}, 1), null);
  assert.equal(raySphere({x:0,y:0,z:0}, dir, {x:0,y:0,z:0}, 1).distance, 1);
});

test('rayVerticalCapsule handles cylinder and spherical caps', () => {
  const hit = rayVerticalCapsule({x:0,y:0,z:5}, dir, {x:0,y:0,z:0}, 1, 0.5);
  assert.ok(hit && hit.distance > 4);
  assert.equal(rayVerticalCapsule({x:0,y:5,z:5}, dir, {x:0,y:0,z:0}, 1, 0.5), null);
});

test('nearestHistoricalHit returns closest hit and metadata', () => {
  const hit = nearestHistoricalHit({x:0,y:0,z:5}, dir, [
    {entityId:1, zone:'torso', position:{x:0,y:0,z:0}, radius:0.5},
    {entityId:2, zone:'head', position:{x:0,y:0,z:2}, radius:0.25},
  ]);
  assert.equal(hit.entityId, 2);
  assert.equal(hit.zone, 'head');
});
