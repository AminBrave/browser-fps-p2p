import { copyWeaponState } from '../../../ecs/components/Weapon.js';

function applyActiveWeaponSlot(entity, slot) {
  if (!entity?.loadout?.slots || !entity.weapon || !Number.isInteger(slot)) return false;
  const slots = entity.loadout.slots;
  if (slot < 0 || slot >= slots.length) return false;

  const current = Number.isInteger(entity.loadout.active) ? entity.loadout.active : 0;
  if (current === slot) return false;

  if (slots[current]) {
    copyWeaponState(slots[current], entity.weapon);
  }

  entity.loadout.active = slot;
  copyWeaponState(entity.weapon, slots[slot]);
  entity.weapon.isReloading = false;
  entity.weapon.reloadStartTime = 0;
  entity.weapon.reloadStartTick = 0;
  entity.weapon.reloadEndTick = 0;
  entity.weapon.shotsInBurst = 0;
  entity.weapon.currentSpread = 0;
  entity.weapon.shootHeldPrev = false;
  entity.weapon.cameraRecoilPitch = 0;
  entity.weapon.cameraRecoilYaw = 0;
  // Presentation consumes this marker exactly once after the authoritative
  // simulation transition. Do not route the selection back through input.
  entity.weapon.pendingPresentationTypeId = entity.weapon.typeId;
  return true;
}

export function applySimulationStateInputToEcs(ecsWorld, state) {
  if (!ecsWorld?.with) throw new TypeError('ECS world is required');
  if (!state || !(state.players instanceof Map)) throw new TypeError('SimulationState is required');

  for (const entity of ecsWorld.with('player', 'input', 'transform')) {
    const playerId = String(entity.player?.id);
    const player = state.players.get(playerId);
    if (!player) continue;

    Object.assign(entity.input, player.input, {
      stance: player.stance,
      // Weapon selection is already resolved by the authoritative simulation.
      // Never feed it back through the input/weapon system as a second command.
      weaponSlot: -1,
    });
    applyActiveWeaponSlot(entity, player.weapon.slot);
    if (entity.player) {
      entity.player.health = player.health;
      entity.player.maxHealth = player.maxHealth;
      entity.player.isDead = player.isDead;
      entity.player.kills = player.kills;
      entity.player.deaths = player.deaths;
      entity.player.lastDamagedTick = player.lastDamagedTick;
      entity.player.deathTick = player.deathTick;
      entity.player.respawnTimer = player.respawnTimer;
    }
    if (entity.weapon) {
      entity.weapon.magazine = player.weapon.magazine;
      entity.weapon.reserveAmmo = player.weapon.reserveAmmo;
      entity.weapon.ammo = player.weapon.magazine;
      entity.weapon.currentAmmo = player.weapon.magazine;
      entity.weapon.isReloading = player.weapon.isReloading;
      entity.weapon.reloadStartTick = player.weapon.reloadStartTick;
      entity.weapon.reloadEndTick = player.weapon.reloadEndTick;
      entity.weapon.lastFiredTick = player.weapon.lastFiredTick;
      entity.weapon.hasFired = player.weapon.hasFired;
      entity.weapon.currentSpread = player.weapon.currentSpread;
      entity.weapon.cameraRecoilPitch = player.weapon.cameraRecoilPitch;
    }
    if (entity.transform.rotation) {
      entity.transform.rotation.yaw = player.rotation.yaw;
      entity.transform.rotation.pitch = player.rotation.pitch;
    }
  }
}


export function applySimulationStateMovementToEcs(ecsWorld, state) {
  if (!ecsWorld?.with) throw new TypeError('ECS world is required');
  if (!state || !(state.players instanceof Map)) throw new TypeError('SimulationState is required');

  for (const entity of ecsWorld.with('player', 'transform', 'physics')) {
    const player = state.players.get(String(entity.player?.id));
    if (!player) continue;
    entity.physics.velocity = { ...player.velocity };
    entity.physics.isGrounded = player.grounded;
    if (entity.transform?.rotation) {
      entity.transform.rotation.yaw = player.rotation.yaw;
      entity.transform.rotation.pitch = player.rotation.pitch;
    }
  }
}
