import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '../app/App';
import { DEVICE_MODE_KEY, type DeviceMode } from '../app/device-mode';
import { createQueryClient } from '../app/query-client';
import { createAppRouter } from '../app/router';

/** Рендерира цялото приложение (router + query) върху history в памет. */
export function renderApp(path = '/') {
  const queryClient = createQueryClient({ retry: false });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return {
    router,
    ...render(<App router={router} queryClient={queryClient} />),
  };
}

/** Устройството вече е настроено: режим и (за телефон) действащ потребител. */
export function setUpDevice(mode: DeviceMode, actingUserId?: string) {
  localStorage.setItem(DEVICE_MODE_KEY, mode);
  if (actingUserId) {
    localStorage.setItem('family.actingUserId', actingUserId);
  }
}
