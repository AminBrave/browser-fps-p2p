/**
 * Pure player-health rules. No ECS, physics, rendering, audio, or networking.
 */
export function applyDamageToHealth(currentHealth, amount) {
  const health = Math.max(0, Number(currentHealth) || 0);
  const damage = Math.max(0, Number(amount) || 0);
  const nextHealth = Math.max(0, health - damage);
  return Object.freeze({
    damage,
    previousHealth: health,
    health: nextHealth,
    killed: nextHealth <= 0 && health > 0,
  });
}

export function calculateHealthRegen({ health, maxHealth, elapsedMs, delayMs, ratePerSecond }) {
  const max = Math.max(1, Number(maxHealth) || 100);
  const current = Math.max(0, Math.min(max, Number(health) || 0));
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const delay = Math.max(0, Number(delayMs) || 0);
  const rate = Math.max(0, Number(ratePerSecond) || 0);

  if (current >= max || elapsed < delay || rate <= 0) return 0;
  return Math.min(max - current, rate * elapsed / 1000);
}
