// src/ecs/components/Weapon.js

import { DEFAULT_WEAPON, FIRE_MODE, WEAPON_LOADOUT } from '../../config/constants.js';

export function createWeaponFromConfig(config = DEFAULT_WEAPON) {
  const mag = config.MAGAZINE_SIZE ?? 12;
  const reserve = config.RESERVE_AMMO ?? mag * 3;

  return {
    typeId: config.ID,
    slot: config.SLOT ?? 0,
    name: config.NAME || 'Weapon',
    magazine: mag,
    magazineSize: mag,
    reserveAmmo: reserve,
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
    spreadBase: config.SPREAD_BASE ?? 0,
    spreadGrow: config.SPREAD_GROW ?? 0.01,
    spreadMax: config.SPREAD_MAX ?? 0.05,
    spreadDecay: config.SPREAD_DECAY ?? 0.12,
    pellets: config.PEL_PELLETS || config.PEL_PELLETS === 0 ? config.PEL_PELLETS : (config.PEL_PELLETS ?? config.PEL_PELLETS),
    pelletCount: config.PELLETS ?? 1,
    // Runtime bloom (radians). First shot of a burst uses 0 extra bloom.
    currentSpread: 0,
    shotsInBurst: 0,
    shootHeldPrev: false,
    cameraRecoilPitch: 0,
    cameraRecoilYaw: 0,
    justFired: false,
    justReloaded: false,
    justStartedReload: false,
  };
}

/** Fix pelletCount if typo above */
export function createWeapon(config = DEFAULT_WEAPON) {
  const w = createWeaponFromConfig(config);
  w.pelletCount = config.PELLETS ?? config.PELLETS ?? 1;
  if (config.PELLETS != null) w.pelletCount = config.SIDELETS;
  w.pelletCount = config.PELLETS ?? 1;
  return w;
}

/** Full loadout state attached to player */
export function createLoadout() {
  return {
    slots: WEAPON_LOADOUT.map((cfg) => createWeapon(cfg)),
    active: 0,
  };
}

export function applyWeaponConfig(weapon, config) {
  const mag = config.MAGAZINE_SIZE ?? 12;
  const reserve = config.RESERVE_AMMO ?? mag * 3;
  Object.assign(weapon, {
    typeId: config.ID,
    slot: config.SLOT ?? 0,
    name: config.NAME || 'Weapon',
    magazine: mag,
    magazineSize: mag,
    reserveAmmo: reserve,
    ammo: mag,
    currentAmmo: mag,
    maxAmmo: mag,
    fireRateMs: config.FIRE_RATE_MS,
    damage: config.DAMAGE,
    range: config.RANGE,
    fireMode: config.FIRE_MODE || FIRE_MODE.SEMI,
    isReloading: false,
    reloadStartTime: 0,
    reloadTimeMs: config.RELOAD_TIME_MS,
    recoilPitch: config.RECOIL_PITCH || 0.04,
    recoilYawSpread: config.RECOIL_YAW_SPREAD || 0.01,
    spreadBase: config.SPREAD_BASE ?? 0,
    spreadGrow: config.SPREAD_GROW ?? 0.01,
    spreadMax: config.SPREAD_MAX ?? 0.05,
    spreadDecay: config.SPREAD_DECAY ?? 0.12,
    pelletCount: config.PELLETS ?? 1,
    currentSpread: 0,
    shotsInBurst: 0,
  });
}
