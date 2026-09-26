// src/ecs/components/Weapon.js

import { WEAPON_CONFIG } from '../../config/constants.js';

/**
 * Weapon Component Data Schema
 * Tracks current active weapon state, firing cooldown timers, ammo capacity,
 * and reloading progression for combat systems.
 *
 * Note: both `currentAmmo`/`ammo` and `maxAmmo` are kept in sync so HUD and
 * systems can use either name without undefined reads.
 */
export const WeaponComponent = {
  typeId: WEAPON_CONFIG.PISTOL.ID,
  currentAmmo: WEAPON_CONFIG.PISTOL.AMMO_CAPACITY,
  ammo: WEAPON_CONFIG.PISTOL.AMMO_CAPACITY,
  maxAmmo: WEAPON_CONFIG.PISTOL.AMMO_CAPACITY,
  lastFiredTime: 0,
  fireRateMs: WEAPON_CONFIG.PISTOL.FIRE_RATE_MS,
  damage: WEAPON_CONFIG.PISTOL.DAMAGE,
  range: WEAPON_CONFIG.PISTOL.RANGE,
  isReloading: false,
  reloadStartTime: 0,
  reloadTimeMs: WEAPON_CONFIG.PISTOL.RELOAD_TIME_MS,
};

/**
 * Creates a default Weapon component data structure using configuration presets.
 * @param {object} [config=WEAPON_CONFIG.PISTOL] - Weapon specification object.
 * @returns {typeof WeaponComponent}
 */
export function createWeapon(config = WEAPON_CONFIG.PISTOL) {
  const capacity = config.AMMO_CAPACITY;
  return {
    typeId: config.ID,
    currentAmmo: capacity,
    ammo: capacity, // alias for HUD / systems that read weapon.ammo
    maxAmmo: capacity,
    lastFiredTime: 0,
    fireRateMs: config.FIRE_RATE_MS,
    damage: config.DAMAGE,
    range: config.RANGE,
    isReloading: false,
    reloadStartTime: 0,
    reloadTimeMs: config.RELOAD_TIME_MS,
  };
}
