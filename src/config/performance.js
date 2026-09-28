// Local-only presentation/performance settings.
// Never send these values over the network: simulation and protocol behavior must
// remain identical for every peer.

export const PERFORMANCE_PROFILES = Object.freeze({
  low: Object.freeze({
    id: 'low',
    label: 'Performance',
    description: 'Lowest GPU/CPU usage. Best for integrated graphics and laptops.',
    pixelRatioScale: 0.70,
    maxPixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    toneMapping: false,
    maxFogDistance: 75,
    impactQuality: 0.35,
    maxImpactReactions: 32,
    maxParticlesPerImpact: 12,
    muzzleLights: false,
    renderFps: 60,
    remoteVisualHz: 20,
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Balanced',
    description: 'Good image quality with controlled GPU/CPU usage.',
    pixelRatioScale: 0.85,
    maxPixelRatio: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    toneMapping: true,
    maxFogDistance: 105,
    impactQuality: 0.65,
    maxImpactReactions: 64,
    maxParticlesPerImpact: 20,
    muzzleLights: false,
    renderFps: 60,
    remoteVisualHz: 30,
  }),
  high: Object.freeze({
    id: 'high',
    label: 'Quality',
    description: 'Higher visual quality while keeping sensible browser limits.',
    pixelRatioScale: 1,
    maxPixelRatio: 1.75,
    antialias: true,
    shadows: true,
    shadowMapSize: 1536,
    toneMapping: true,
    maxFogDistance: 120,
    impactQuality: 1,
    maxImpactReactions: 96,
    maxParticlesPerImpact: 28,
    muzzleLights: true,
    renderFps: 90,
    remoteVisualHz: 60,
  }),
});

export const PERFORMANCE_PROFILE_IDS = Object.freeze(Object.keys(PERFORMANCE_PROFILES));
export const PERFORMANCE_STORAGE_KEY = 'p2p-fps-performance-profile';

function hardwareSuggestedProfile() {
  if (typeof navigator === 'undefined') return 'medium';
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const memory = Number(navigator.deviceMemory) || 4;
  const narrowViewport = Math.min(globalThis.innerWidth || 9999, globalThis.innerHeight || 9999) < 720;
  if (cores <= 2 || memory <= 2 || narrowViewport) return 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  return 'medium';
}

export function normalizePerformanceProfile(id) {
  return PERFORMANCE_PROFILES[id] ? id : 'medium';
}

export function getSavedPerformanceProfile() {
  if (typeof localStorage === 'undefined') return 'auto';
  const value = localStorage.getItem(PERFORMANCE_STORAGE_KEY);
  if (value === 'auto' || PERFORMANCE_PROFILES[value]) return value;
  return 'auto';
}

export function resolvePerformanceProfile(id = getSavedPerformanceProfile()) {
  const normalized = id === 'auto' ? hardwareSuggestedProfile() : normalizePerformanceProfile(id);
  return PERFORMANCE_PROFILES[normalized];
}

export function setSavedPerformanceProfile(id) {
  const value = id === 'auto' || PERFORMANCE_PROFILES[id] ? id : 'auto';
  try { localStorage.setItem(PERFORMANCE_STORAGE_KEY, value); } catch { /* storage can be unavailable */ }
  return value;
}
