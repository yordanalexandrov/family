import { useSyncExternalStore } from 'react';
import { logger } from '../logger';

/*
 * Режим на устройството (GLOSSARY: device mode), настройка на самото устройство в
 * localStorage. `?device=phone|kiosk|tv` в адреса го записва (router.tsx маха
 * параметъра). Без режим root layout-ът води към „Какво е това устройство?“.
 */
export type DeviceMode = 'phone' | 'kiosk' | 'tv';

export const DEVICE_MODE_KEY = 'family.deviceMode';

export const DEVICE_MODES: readonly DeviceMode[] = ['phone', 'kiosk', 'tv'];

export function parseDeviceMode(value: unknown): DeviceMode | null {
  return DEVICE_MODES.find((mode) => mode === value) ?? null;
}

const listeners = new Set<() => void>();

export function readDeviceMode(): DeviceMode | null {
  try {
    return parseDeviceMode(localStorage.getItem(DEVICE_MODE_KEY));
  } catch (error) {
    logger.warn('localStorage недостъпен', error);
    return null;
  }
}

export function writeDeviceMode(mode: DeviceMode): void {
  try {
    localStorage.setItem(DEVICE_MODE_KEY, mode);
  } catch (error) {
    logger.warn('localStorage недостъпен', error);
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useDeviceMode() {
  const mode = useSyncExternalStore(subscribe, readDeviceMode);
  return { mode, setMode: writeDeviceMode };
}
