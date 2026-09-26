// src/ecs/components/Weapon.js

import { WEAPON_CONFIG } from '../../config/constants.js';

/**
 * Weapon Component Data Schema
 * Tracks current active weapon state, firing cooldown timers, ammo capacity, 
 * and reloading progression for combat systems.
 */
export const WeaponComponent = {
  // Numeric weapon identifier matching WEAPON_CONFIG
  typeId: WEAPON_CONFIG.PISTOL.ID,
  // Current loaded round count
  currentAmmo: WEAPON_CONFIG.PISTOL.AMMO_CAPACITY,
  // Maximum capacity per clip/magazine
  maxAmmo: WEAPON_CONFIG.PISTOL.AMMO_CAPACITY,
  // Timestamp tracking time since last shot was fired (ms)
  lastFiredTime: 0,
  // Cooldown delay required between shots (ms)
  fireRateMs: WEAPON_CONFIG.PISTOL.FIRE_RATE_MS,
  // Single-shot hit damage
  damage: WEAPON_CONFIG.PISTOL.DAMAGE,
  // Effective raycast range (meters)
  range: WEAPON_CONFIG.PISTOL.RANGE,
  // Active reload state indicator
  isReloading: false,
  // Timestamp when current reload initiated (ms)
  reloadStartTime: 0,
  // Duration needed to complete reload (ms)
  reloadTimeMs: WEAPON_CONFIG.PISTOL.RELOAD_TIME_MS,
};

/**
 * Creates a default Weapon component data structure using configuration presets.
 * @param {object} [config=WEAPON_CONFIG.PISTOL] - Weapon specification object.
 * @returns {typeof WeaponComponent}
 */
export function createWeapon(config = WEAPON_CONFIG.PISTOL) {
  return {
    typeId: config.ID,
    currentAmmo: config.AMMO_CAPACITY,
    maxAmmo: config.AMMO_CAPACITY,
    lastFiredTime: 0,
    fireRateMs: config.FIRE_RATE_MS,
    damage: config.DAMAGE,
    range: config.RANGE,
    isReloading: false,
    reloadStartTime: 0,
    reloadTimeMs: config.RELOAD_TIME_MS,
  };
}