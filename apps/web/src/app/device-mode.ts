import { useSyncExternalStore } from 'react';
import { storedSetting } from './stored-setting';

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

const deviceMode = storedSetting<DeviceMode | null>({
  key: DEVICE_MODE_KEY,
  parse: parseDeviceMode,
  unset: null,
});

export const readDeviceMode = deviceMode.read;

export function useDeviceMode() {
  return {
    mode: useSyncExternalStore(deviceMode.subscribe, deviceMode.read),
    setMode: deviceMode.write,
  };
}
