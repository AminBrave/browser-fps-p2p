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
