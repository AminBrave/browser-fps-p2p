// src/ecs/components/Weapon.js

import { DEFAULT_WEAPON, FIRE_MODE } from '../../config/constants.js';

/**
 * Weapon state: magazine + reserve, fire mode, recoil bookkeeping.
 * HUD shows: magazine / reserve  (not magazine / magazine).
 */
export function createWeapon(config = DEFAULT_WEAPON) {
  const mag = config.MAGAZINE_SIZE ?? config.AMMO_CAPACITY ?? 12;
  const reserve = config.RESERVE_AMMO ?? mag * 3;

  return {
    typeId: config.ID,
    name: config.NAME || 'Weapon',
    // Mag in gun
    magazine: mag,
    magazineSize: mag,
    // Pool for reloads
    reserveAmmo: reserve,
    // Aliases kept for older HUD paths
    ammo: mag,
    currentAmmo: mag,
    maxAmmo: mag,

    lastFiredTime: 0,
    fireRateMs: config.FIRE_RATE_MS,
    damage: config.DAMAGE,
    range: config.RANGE,
    fireMode: config.FIRE_MODE || FIRE_MODE.SEMI,

    isReloading: false,
    reloadStartTime: 0,
    reloadTimeMs: config.RELOAD_TIME_MS,

    recoilPitch: config.RECOIL_PITCH || 0.04,
    recoilYawSpread: config.RECOIL_YAW_SPREAD || 0.01,

    // Rising-edge tracking for SEMI
    shootHeldPrev: false,

    // Camera punch applied by RenderSystem (radians)
    cameraRecoilPitch: 0,
    cameraRecoilYaw: 0,

    // One-shot flags for audio/viewmodel
    justFired: false,
    justReloaded: false,
    justStartedReload: false,
  };
}
