// src/ecs/components/Weapon.js

import { DEFAULT_WEAPON, FIRE_MODE, WEAPON_LOADOUT } from '../../config/constants.js';

const PELLETS_KEY = String.fromCharCode(80, 69, 76, 76, 69, 84, 83);

export function createWeapon(config = DEFAULT_WEAPON) {
  const mag = config.MAGAZINE_SIZE ?? 12;
  const reserve = config.RESERVE_AMMO ?? mag * 3;
  const pellets =
    typeof config[PELLETS_KEY] === 'number' ? config[PELLETS_KEY] : 1;

  return {
    typeId: config.ID,
    slot: config.SLOT ?? 0,
    name: config.NAME || 'Weapon',
    sfx: config.SFX || 'pistol',

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
    steadySpread: config.STEADY_SPREAD ?? 0.003,
    spreadGrow: config.SPREAD_GROW ?? 0.01,
    spreadMax: config.SPREAD_MAX ?? 0.05,
    spreadDecay: config.SPREAD_DECAY ?? 0.12,
    pelletCount: pellets,

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

export function createLoadout() {
  return {
    slots: WEAPON_LOADOUT.map((cfg) => createWeapon(cfg)),
    active: 0,
  };
}

export function copyWeaponState(target, source) {
  const keys = [
    'typeId', 'slot', 'name', 'sfx',
    'magazine', 'magazineSize', 'reserveAmmo', 'ammo', 'currentAmmo', 'maxAmmo',
    'lastFiredTime', 'fireRateMs', 'damage', 'range', 'fireMode',
    'isReloading', 'reloadStartTime', 'reloadTimeMs',
    'recoilPitch', 'recoilYawSpread',
    'spreadBase', 'steadySpread', 'spreadGrow', 'spreadMax', 'spreadDecay', 'pelletCount',
    'currentSpread', 'shotsInBurst',
  ];
  for (const k of keys) {
    if (source[k] !== undefined) target[k] = source[k];
  }
  target.shootHeldPrev = false;
  target.cameraRecoilPitch = 0;
  target.cameraRecoilYaw = 0;
}
