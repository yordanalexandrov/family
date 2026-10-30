import { useSyncExternalStore } from 'react';
import { storedSetting } from './stored-setting';

/*
 * Режим на устройството (GLOSSARY: device mode), настройка на самото устройство в
 * localStorage. `?device=phone|browser|kiosk|tv` в адреса го записва (router.tsx маха
 * параметъра). Без режим root layout-ът води към „Какво е това устройство?“.
 * `browser` може всичко, което може телефонът, но е подреден за широк екран.
 */
export type DeviceMode = 'phone' | 'browser' | 'kiosk' | 'tv';

export const DEVICE_MODE_KEY = 'family.deviceMode';

export const DEVICE_MODES: readonly DeviceMode[] = [
  'phone',
  'browser',
  'kiosk',
  'tv',
];

export function parseDeviceMode(value: unknown): DeviceMode | null {
  return DEVICE_MODES.find((mode) => mode === value) ?? null;
}

/** Телефонът и браузърът имат човек зад себе си (действащ потребител); kiosk и TV нямат. */
export function isPersonalDevice(mode: DeviceMode | null): boolean {
  return mode === 'phone' || mode === 'browser';
}

/** Всички освен TV се докосват; TV само показва (GLOSSARY: TV). */
export function isInteractiveDevice(mode: DeviceMode | null): boolean {
  return mode !== null && mode !== 'tv';
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
