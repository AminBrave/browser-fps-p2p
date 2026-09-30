function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

export function raySphere(origin, direction, center, radius) {
  const oc = sub(origin, center);
  const b = dot(oc, direction);
  const c = dot(oc, oc) - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = -b - root;
  const far = -b + root;
  const distance = t >= 0 ? t : far >= 0 ? far : null;
  return distance == null ? null : { distance };
}

export function rayVerticalCapsule(origin, direction, center, halfHeight, radius) {
  const candidates = [];
  const cylinderA = { x: center.x, y: center.y - halfHeight, z: center.z };
  const cylinderB = { x: center.x, y: center.y + halfHeight, z: center.z };
  const a = direction.x ** 2 + direction.z ** 2;
  const oc = sub(origin, cylinderA);
  const b = 2 * (oc.x * direction.x + oc.z * direction.z);
  const c = oc.x ** 2 + oc.z ** 2 - radius ** 2;
  if (a > 1e-8) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrt = Math.sqrt(disc);
      for (const t of [(-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a)]) {
        const y = origin.y + direction.y * t;
        if (t >= 0 && y >= cylinderA.y && y <= cylinderB.y) candidates.push(t);
      }
    }
  }
  for (const cap of [cylinderA, cylinderB]) {
    const hit = raySphere(origin, direction, cap, radius);
    if (hit) candidates.push(hit.distance);
  }
  return candidates.length ? { distance: Math.min(...candidates) } : null;
}

export function nearestHistoricalHit(origin, direction, hitboxes) {
  let best = null;
  for (const hitbox of hitboxes || []) {
    const hit = hitbox.halfHeight
      ? rayVerticalCapsule(origin, direction, hitbox.position, hitbox.halfHeight, hitbox.radius)
      : raySphere(origin, direction, hitbox.position, hitbox.radius);
    if (!hit) continue;
    if (!best || hit.distance < best.distance) {
      best = { ...hit, entityId: hitbox.entityId, zone: hitbox.zone };
    }
  }
  return best;
}
