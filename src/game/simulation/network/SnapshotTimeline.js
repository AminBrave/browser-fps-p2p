export function insertSnapshot(buffer, snapshot, maxSnapshots = 16) {
  if (!snapshot) return buffer;

  const timestamp = Number(snapshot.timestamp);
  if (!Number.isFinite(timestamp)) return buffer;

  const last = buffer[buffer.length - 1];
  if (last && timestamp <= last.timestamp) return buffer;

  buffer.push(snapshot);
  const limit = Math.max(1, Number(maxSnapshots) || 1);
  if (buffer.length > limit) {
    buffer.splice(0, buffer.length - limit);
  }
  return buffer;
}

export function sampleSnapshotPair(buffer, targetTime) {
  if (!buffer?.length || !Number.isFinite(targetTime)) return null;

  let older = buffer[0];
  let newer = buffer[buffer.length - 1];

  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].timestamp <= targetTime) {
      older = buffer[i];
      newer = buffer[Math.min(i + 1, buffer.length - 1)];
      break;
    }
  }

  const span = Math.max(1, newer.timestamp - older.timestamp);
  const alpha = Math.max(
    0,
    Math.min(1, (targetTime - older.timestamp) / span)
  );

  return { older, newer, alpha };
}

export function lerpAngle(from, to, alpha) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * alpha;
}
