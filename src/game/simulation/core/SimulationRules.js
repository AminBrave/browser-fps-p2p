import { createPlayerSimulationState } from './SimulationState.js';
import { applyFpsMovement } from '../movement/FpsMovement.js';
import { simulateWeaponCommands, simulateDamageCommands } from '../combat/SimulationCombat.js';

function clampPitch(value) {
  const maxPitch = (89 * Math.PI) / 180;
  return Math.max(-maxPitch, Math.min(maxPitch, Number(value) || 0));
}

export function simulateInputCommands(state, commands) {
  if (!state || !(state.players instanceof Map)) throw new TypeError('SimulationState is required');

  const players = new Map(state.players);
  for (const command of commands) {
    if (command?.type !== 'input') continue;
    const current = players.get(String(command.playerId));
    if (!current || current.isDead) continue;

    players.set(current.id, createPlayerSimulationState({
      ...current,
      rotation: { yaw: command.yaw, pitch: clampPitch(command.pitch) },
      stance: command.stance,
      input: {
        ...current.input,
        inputMask: command.inputMask,
        sequence: command.sequence,
        yaw: command.yaw,
        pitch: clampPitch(command.pitch),
        isAiming: command.isAiming,
      },
      weapon: {
        ...current.weapon,
        slot: command.weaponSlot >= 0 ? command.weaponSlot : current.weapon.slot,
      },
    }));
  }

  return { ...state, players };
}

export function simulatePlayerMovement(state, {
  dt,
  inputFlags,
  movementConfig,
} = {}) {
  if (!state || !(state.players instanceof Map)) throw new TypeError('SimulationState is required');
  if (!(dt > 0) || !inputFlags || !movementConfig) {
    throw new TypeError('Movement simulation context is required');
  }

  const players = new Map();
  for (const current of state.players.values()) {
    if (current.isDead) {
      players.set(current.id, current);
      continue;
    }

    const velocity = { ...current.velocity };
    const grounded = applyFpsMovement({
      inputMask: current.input.inputMask,
      yaw: current.rotation.yaw,
      velocity,
      isGrounded: current.grounded,
      dt,
      stance: current.stance,
      inputFlags,
      movementConfig,
    });

    players.set(current.id, createPlayerSimulationState({
      ...current,
      velocity,
      grounded,
    }));
  }

  return { ...state, players };
}

export function simulateTick(state, commands, context) {
  let next = simulateInputCommands(state, commands);
  if (context?.movement) {
    next = simulatePlayerMovement(next, context.movement);
  }

  const weaponResult = simulateWeaponCommands(next, commands, {
    tick: context?.tick ?? next.tick,
    tickRate: context?.tickRate ?? next.tickRate,
  });
  next = weaponResult;

  const damageResult = simulateDamageCommands(next, commands, {
    tick: context?.tick ?? next.tick,
    tickRate: context?.tickRate ?? next.tickRate,
  });
  next = damageResult.state;

  return {
    state: { ...next, tick: Number(context?.tick ?? next.tick) >>> 0 },
    events: [...weaponResult.events, ...damageResult.events],
  };
}
