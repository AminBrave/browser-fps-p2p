// src/network/WorldSync.js
//
// The host is the authority for the match definition. A client must build
// exactly the same static world before it is allowed to simulate gameplay.
//
// The manifest is deliberately JSON-only: no functions, class instances or
// renderer/physics objects cross the network. Those are reconstructed locally
// from the same authoritative data.

import {
  WORLD_CONFIG,
  GAME_CONFIG,
  NETWORK_CONFIG,
  INPUT_FLAGS,
  PLAYER_CHARACTER_CONFIG,
} from '../config/index.js';

export const WORLD_SCHEMA_VERSION = 1;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] = canonicalize(value[key]);
        return out;
      }, {});
  }
  return value;
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createWorldManifest() {
  const config = {
    world: JSON.parse(JSON.stringify(WORLD_CONFIG)),
    game: JSON.parse(JSON.stringify(GAME_CONFIG)),
    network: JSON.parse(JSON.stringify(NETWORK_CONFIG)),
    inputFlags: JSON.parse(JSON.stringify(INPUT_FLAGS)),
    playerCharacter: JSON.parse(JSON.stringify(PLAYER_CHARACTER_CONFIG)),
  };
  const canonical = JSON.stringify({
    schemaVersion: WORLD_SCHEMA_VERSION,
    config: canonicalize(config),
  });

  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    hash: fnv1a32(canonical),
    config,
  };
}

export function applyWorldManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== WORLD_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported world schema: ${manifest?.schemaVersion ?? 'missing'}`
    );
  }

  if (!manifest.config || typeof manifest.config !== 'object') {
    throw new Error('Host sent an invalid world manifest');
  }

  const canonical = JSON.stringify({
    schemaVersion: WORLD_SCHEMA_VERSION,
    config: canonicalize(manifest.config),
  });

  const expectedHash = fnv1a32(canonical);
  if ((manifest.hash >>> 0) !== expectedHash) {
    throw new Error(
      `World manifest hash mismatch: received ${manifest.hash >>> 0}, calculated ${expectedHash}`
    );
  }

  const config = manifest.config;
  if (!config.world || !config.game || !config.network || !config.inputFlags || !config.playerCharacter) {
    throw new Error('Host sent an incomplete world/simulation manifest');
  }

  // Keep imported object identities intact because gameplay modules import
  // these shared definitions directly. Replace their complete contents before
  // any client-side map/physics construction occurs.
  for (const key of Object.keys(WORLD_CONFIG)) delete WORLD_CONFIG[key];
  Object.assign(WORLD_CONFIG, JSON.parse(JSON.stringify(config.world)));
  for (const key of Object.keys(GAME_CONFIG)) delete GAME_CONFIG[key];
  Object.assign(GAME_CONFIG, JSON.parse(JSON.stringify(config.game)));
  for (const key of Object.keys(NETWORK_CONFIG)) delete NETWORK_CONFIG[key];
  Object.assign(NETWORK_CONFIG, JSON.parse(JSON.stringify(config.network)));
  for (const key of Object.keys(INPUT_FLAGS)) delete INPUT_FLAGS[key];
  Object.assign(INPUT_FLAGS, JSON.parse(JSON.stringify(config.inputFlags)));
  for (const key of Object.keys(PLAYER_CHARACTER_CONFIG)) delete PLAYER_CHARACTER_CONFIG[key];
  Object.assign(PLAYER_CHARACTER_CONFIG, JSON.parse(JSON.stringify(config.playerCharacter)));

  return manifest.hash >>> 0;
}

export function getWorldHash() {
  return createWorldManifest().hash;
}
