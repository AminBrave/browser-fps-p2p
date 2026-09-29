import { NETWORK_CONFIG } from './network.js';

export const NETWORK_CONNECTION_MODES = Object.freeze(NETWORK_CONFIG.WEBRTC.CONNECTION_MODES);

function isValidMode(value) {
  return Object.values(NETWORK_CONNECTION_MODES).includes(value);
}

export function normalizeNetworkConnectionMode(value) {
  return isValidMode(value) ? value : NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE;
}

export function getSavedNetworkConnectionMode() {
  if (typeof localStorage === 'undefined') return NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE;
  try {
    return normalizeNetworkConnectionMode(localStorage.getItem(NETWORK_CONFIG.WEBRTC.CONNECTION_MODE_STORAGE_KEY));
  } catch {
    return NETWORK_CONFIG.WEBRTC.DEFAULT_CONNECTION_MODE;
  }
}

export function setSavedNetworkConnectionMode(value) {
  const mode = normalizeNetworkConnectionMode(value);
  try {
    localStorage.setItem(NETWORK_CONFIG.WEBRTC.CONNECTION_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage may be disabled; the current selection still remains valid in memory.
  }
  return mode;
}


export function normalizePlayerName(value) {
  const fallback = NETWORK_CONFIG.MULTIPLAYER.DEFAULT_PLAYER_NAME;
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, NETWORK_CONFIG.MULTIPLAYER.MAX_PLAYER_NAME_LENGTH);
  return normalized || fallback;
}

export function getSavedPlayerName() {
  if (typeof localStorage === 'undefined') return NETWORK_CONFIG.MULTIPLAYER.DEFAULT_PLAYER_NAME;
  try {
    return normalizePlayerName(localStorage.getItem(NETWORK_CONFIG.MULTIPLAYER.PLAYER_NAME_STORAGE_KEY));
  } catch {
    return NETWORK_CONFIG.MULTIPLAYER.DEFAULT_PLAYER_NAME;
  }
}

export function setSavedPlayerName(value) {
  const name = normalizePlayerName(value);
  try {
    localStorage.setItem(NETWORK_CONFIG.MULTIPLAYER.PLAYER_NAME_STORAGE_KEY, name);
  } catch {
    // Storage may be disabled; the current selection remains valid in memory.
  }
  return name;
}
