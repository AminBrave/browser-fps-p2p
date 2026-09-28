export function createImpactSeed({ shooterId, weaponId, position, material, sequence = 0 } = {}) {
  const text = String(shooterId ?? 'world') + ':' + String(weaponId ?? 0) + ':' +
    String(material ?? 'default') + ':' + String(sequence ?? 0) + ':' +
    [
      Math.round((Number(position?.x) || 0) * 100),
      Math.round((Number(position?.y) || 0) * 100),
      Math.round((Number(position?.z) || 0) * 100),
    ].join(',');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
