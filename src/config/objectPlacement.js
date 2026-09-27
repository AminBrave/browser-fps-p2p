// src/config/objectPlacement.js

const TAU = Math.PI * 2;

function hash32(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let state = hash32(seed) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) & 0xfffffff) / 0x10000000;
  };
}
function inside(bounds, x, z, padding = 0) {
  return x >= -bounds.halfWidth + padding && x <= bounds.halfWidth - padding &&
    z >= -bounds.halfLength + padding && z <= bounds.halfLength - padding;
}
function evenGrid(bounds, count, padding, offset = 0) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const out = [];
  for (let row = 0; row < rows && out.length < count; row++) for (let col = 0; col < cols && out.length < count; col++) {
    const x = -bounds.halfWidth + padding + ((col + 0.5) / cols) * (2 * (bounds.halfWidth - padding));
    const z = -bounds.halfLength + padding + ((row + 0.5) / rows) * (2 * (bounds.halfLength - padding));
    out.push({ x, z, rotationY: offset });
  }
  return out;
}
function manhattan(bounds, count, padding, roadSpacing = 8) {
  const out = [], xs = [], zs = [];
  for (let x = -bounds.halfWidth + padding; x <= bounds.halfWidth - padding; x += roadSpacing) xs.push(x);
  for (let z = -bounds.halfLength + padding; z <= bounds.halfLength - padding; z += roadSpacing) zs.push(z);
  for (const x of xs) for (const z of zs) {
    if (out.length >= count) break;
    const side = ((out.length + 1) % 2 === 0 ? 1 : -1) * Math.min(2, roadSpacing * 0.22);
    const useXRoad = out.length % 2 === 0;
    out.push({ x: useXRoad ? x + side : x, z: useXRoad ? z : z + side, rotationY: useXRoad ? Math.PI / 2 : 0 });
  }
  return out;
}
function roadside(bounds, count, padding, roadSpacing = 10) {
  const out = [], next = rng(String(count) + ':roadside');
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1, t = next() * 2 - 1;
    if (i % 4 < 2) out.push({ x: t * (bounds.halfWidth - padding), z: side * Math.min(bounds.halfLength - padding, roadSpacing * 0.32), rotationY: Math.PI / 2 });
    else out.push({ x: side * Math.min(bounds.halfWidth - padding, roadSpacing * 0.32), z: t * (bounds.halfLength - padding), rotationY: 0 });
  }
  return out;
}
function rural(bounds, count, padding, seed) {
  const next = rng(seed), out = [];
  for (let i = 0; i < count; i++) {
    const a = next() * TAU, r = Math.sqrt(next()) * Math.min(bounds.halfWidth, bounds.halfLength) * 0.9;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rotationY: next() * TAU });
  }
  return out;
}
function radial(bounds, count, padding, seed) {
  const next = rng(seed), radius = Math.min(bounds.halfWidth, bounds.halfLength) - padding;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * TAU + next() * 0.12, r = radius * (0.35 + 0.55 * next());
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, rotationY: a + Math.PI / 2 };
  });
}
function ring(bounds, count, padding, seed) {
  const next = rng(seed), r = Math.min(bounds.halfWidth, bounds.halfLength) * 0.62;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * TAU + next() * 0.05;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, rotationY: a + Math.PI / 2 };
  });
}
function clustered(bounds, count, padding, seed) {
  const next = rng(seed), centers = Array.from({ length: Math.max(2, Math.ceil(count / 5)) }, () => ({
    x: (next() * 2 - 1) * (bounds.halfWidth - padding) * 0.75,
    z: (next() * 2 - 1) * (bounds.halfLength - padding) * 0.75,
  }));
  return Array.from({ length: count }, (_, i) => {
    const c = centers[i % centers.length], a = next() * TAU, r = Math.sqrt(next()) * 4.5;
    return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, rotationY: next() * TAU };
  });
}
function poisson(bounds, count, padding, seed, minSpacing = 3) {
  const next = rng(seed), out = [], minSq = minSpacing * minSpacing;
  for (let attempt = 0; attempt < Math.max(count * 30, 120) && out.length < count; attempt++) {
    const x = (next() * 2 - 1) * (bounds.halfWidth - padding), z = (next() * 2 - 1) * (bounds.halfLength - padding);
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < minSq)) continue;
    out.push({ x, z, rotationY: next() * TAU });
  }
  return out;
}
function quincunx(bounds, count, padding) {
  return evenGrid(bounds, count, padding).map((p, i) => ({ ...p, x: p.x + (i % 2 ? 1.2 : -1.2), z: p.z + (i % 3 ? 0 : 1.2), rotationY: i % 2 ? Math.PI / 2 : 0 }));
}
function spiral(bounds, count, padding) {
  const maxR = Math.min(bounds.halfWidth, bounds.halfLength) - padding;
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1), a = t * TAU * 2.25, r = maxR * (0.12 + t * 0.82);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, rotationY: a + Math.PI / 2 };
  });
}

const ALGORITHMS = { EVEN: evenGrid, GRID: evenGrid, MANHATTAN: manhattan, ROADSIDE: roadside, RURAL: rural, RANDOM: rural, RADIAL: radial, RING: ring, CLUSTERED: clustered, POISSON: poisson, QUINCUNX: quincunx, SPIRAL: spiral };

export function generateObjectPlacements({ pattern = 'MANHATTAN', count = 20, density = 1, bounds, padding = 2, minSpacing = 2.5, roadSpacing = 8, seed = 'world', reservedZones = [] } = {}) {
  const total = Math.max(0, Math.round(count * Math.max(0, Math.min(1, density))));
  const generator = ALGORITHMS[String(pattern).toUpperCase()] || ALGORITHMS.MANHATTAN;
  const candidates = generator(bounds, total, padding, seed, minSpacing, roadSpacing);
  const accepted = [], minSq = minSpacing * minSpacing;
  for (const candidate of candidates) {
    if (!inside(bounds, candidate.x, candidate.z, padding)) continue;
    if (reservedZones.some((zone) => (candidate.x - zone.x) ** 2 + (candidate.z - zone.z) ** 2 < zone.radius ** 2)) continue;
    if (accepted.some((p) => (p.x - candidate.x) ** 2 + (p.z - candidate.z) ** 2 < minSq)) continue;
    accepted.push(candidate);
    if (accepted.length >= total) break;
  }
  return accepted;
}
export const OBJECT_PLACEMENT_ALGORITHMS = Object.freeze(Object.keys(ALGORITHMS));
