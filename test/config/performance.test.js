import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERFORMANCE_PROFILES,
  PERFORMANCE_PROFILE_IDS,
  normalizePerformanceProfile,
  resolvePerformanceProfile,
} from '../../src/config/performance.js';

test('performance profiles are complete and ordered from low to high cost', () => {
  assert.deepEqual(PERFORMANCE_PROFILE_IDS, ['low', 'medium', 'high']);
  for (const id of PERFORMANCE_PROFILE_IDS) {
    const profile = PERFORMANCE_PROFILES[id];
    assert.equal(profile.id, id);
    assert.ok(profile.maxPixelRatio > 0);
    assert.ok(profile.maxImpactReactions > 0);
    assert.ok(profile.maxParticlesPerImpact > 0);
    assert.ok(profile.renderFps >= 30);
    assert.ok(profile.remoteVisualHz >= 10);
  }
  assert.equal(PERFORMANCE_PROFILES.low.antialias, false);
  assert.equal(PERFORMANCE_PROFILES.low.shadows, false);
  assert.equal(PERFORMANCE_PROFILES.medium.shadows, true);
  assert.equal(PERFORMANCE_PROFILES.high.muzzleLights, true);
});

test('invalid explicit profile ids fall back safely', () => {
  assert.equal(normalizePerformanceProfile('does-not-exist'), 'medium');
  assert.equal(resolvePerformanceProfile('does-not-exist').id, 'medium');
});
