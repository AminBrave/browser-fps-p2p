import { FIRE_MODE } from '../../../config/index.js';

export function shouldFire({ weapon, wantShoot, shootPressed, now }) {
  if (!weapon || weapon.isReloading) return false;
  const cooled = now - (Number(weapon.lastFiredTime) || 0) >= (Number(weapon.fireRateMs) || 200);
  return weapon.fireMode === FIRE_MODE.AUTO
    ? !!wantShoot && cooled
    : !!shootPressed && cooled;
}

export function canReload(weapon, wantReload, wantShoot) {
  if (!weapon || weapon.isReloading) return false;
  const magazine = Number(weapon.magazine) || 0;
  const size = Number(weapon.magazineSize) || 12;
  const reserve = Number(weapon.reserveAmmo) || 0;
  return (wantReload || (wantShoot && magazine <= 0)) && magazine < size && reserve > 0;
}

export function completeReload(weapon) {
  if (!weapon) return null;
  const size = Number(weapon.magazineSize) || 12;
  const magazine = Number(weapon.magazine) || 0;
  const reserve = Number(weapon.reserveAmmo) || 0;
  const take = Math.min(Math.max(0, size - magazine), reserve);
  return Object.freeze({
    magazine: magazine + take,
    reserveAmmo: reserve - take,
    completed: true,
  });
}
