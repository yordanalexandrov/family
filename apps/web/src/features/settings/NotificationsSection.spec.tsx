import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { apiError, dani, poli, server } from '../../test/msw';
import {
  servePushApi,
  stubPushBrowser,
  TEST_ENDPOINT,
  TEST_VAPID_KEY,
} from '../../test/push';
import { renderApp, setUpDevice } from '../../test/render';
import { SERVICE_WORKER_TIMEOUT_MS } from './push';

async function findSection() {
  return screen.findByRole('region', { name: 'Известия' });
}

describe('Настройки → Известия', () => {
  beforeEach(() => {
    setUpDevice('phone', dani.id);
  });

  it('„Включи известия“ иска разрешение, абонира устройството с ключа на api-то и го изпраща', async () => {
    const browser = stubPushBrowser();
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    await user.click(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    );

    expect(
      await within(section).findByRole('button', {
        name: 'Изключи на това устройство',
      }),
    ).toBeInTheDocument();
    expect(browser.notification.requestPermission).toHaveBeenCalled();
    expect(browser.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: TEST_VAPID_KEY,
    });
    expect(
      api.requests.filter(
        (r) => r.method === 'PUT' && r.path.endsWith('/subscription'),
      ),
    ).toEqual([
      {
        method: 'PUT',
        path: '/api/notifications/subscription',
        actingUser: dani.id,
        body: {
          endpoint: TEST_ENDPOINT,
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
      },
    ]);
  });

  it('докато абонирането чака, бутонът е „Включване…“, изключен и със спинер; после казва, че са включени', async () => {
    const browser = stubPushBrowser({ slowSubscribe: true });
    servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    await user.click(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    );

    const pending = await within(section).findByRole('button', {
      name: 'Включване…',
    });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');

    browser.finishSubscribe();

    expect(
      await screen.findByText('Известията са включени'),
    ).toBeInTheDocument();
    expect(
      await within(section).findByRole('button', { name: 'Изпрати пробно' }),
    ).toBeInTheDocument();
  });

  it('грешка при записа на абонамента показва съобщението и бутона отново', async () => {
    const browser = stubPushBrowser();
    servePushApi();
    server.use(
      http.put('/api/notifications/subscription', () =>
        apiError(500, 'error', 'Абонаментът не се записа'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    await user.click(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    );

    expect(
      await screen.findByText('Абонаментът не се записа'),
    ).toBeInTheDocument();
    expect(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    ).toBeEnabled();
    expect(browser.subscription()).toBeNull();
    expect(
      screen.queryByText('Известията са включени'),
    ).not.toBeInTheDocument();
  });

  it('без активен service worker картата не чака безкрайно: „Опитай пак“ проверява отново', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    stubPushBrowser({ noActiveWorker: true });
    servePushApi();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/settings');

    const section = await findSection();
    await act(() => vi.advanceTimersByTimeAsync(SERVICE_WORKER_TIMEOUT_MS));

    expect(
      await within(section).findByText(
        'Известията още не са готови на това устройство. Опитай пак по-късно.',
      ),
    ).toBeVisible();
    expect(
      within(section).queryByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    ).toBeNull();

    stubPushBrowser();
    await user.click(
      within(section).getByRole('button', { name: 'Опитай пак' }),
    );

    expect(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    ).toBeInTheDocument();
  });

  it('без абонамент видовете са приглушени и казват, че важат след включване на устройството', async () => {
    stubPushBrowser();
    servePushApi();
    renderApp('/settings');

    const section = await findSection();
    const kinds = await within(section).findByRole('group', {
      name: 'Видове известия',
    });
    expect(kinds).toHaveAccessibleDescription(
      'Важат, когато включиш известията на това устройство.',
    );
    expect(kinds).toHaveClass('settings__kinds--muted');
    expect(
      within(section).getByText(
        'Видовете са за теб и важат на всичките ти устройства.',
      ),
    ).toBeInTheDocument();
  });

  it('с абонамент видовете не са приглушени', async () => {
    stubPushBrowser({ permission: 'granted', subscribed: true });
    servePushApi();
    renderApp('/settings');

    const section = await findSection();
    const kinds = await within(section).findByRole('group', {
      name: 'Видове известия',
    });
    expect(kinds).not.toHaveClass('settings__kinds--muted');
    expect(
      within(section).queryByText(
        'Важат, когато включиш известията на това устройство.',
      ),
    ).not.toBeInTheDocument();
    expect(
      within(section).getByText(
        'Видовете са за теб и важат на всичките ти устройства.',
      ),
    ).toBeInTheDocument();
  });

  it('отказ в браузъра не абонира устройството и обяснява как се разрешава', async () => {
    const browser = stubPushBrowser({ answer: 'denied' });
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    await user.click(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    );

    expect(
      await within(section).findByText(/Разреши ги от настройките на Android/),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    ).not.toBeInTheDocument();
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.requests.some((r) => r.path.endsWith('/subscription'))).toBe(
      false,
    );
  });

  it('„Изключи на това устройство“ маха абонамента в браузъра и в api-то', async () => {
    const browser = stubPushBrowser({
      permission: 'granted',
      subscribed: true,
    });
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    const subscription = browser.subscription();
    await user.click(
      await within(section).findByRole('button', {
        name: 'Изключи на това устройство',
      }),
    );

    expect(
      await within(section).findByRole('button', {
        name: 'Включи известия на това устройство',
      }),
    ).toBeInTheDocument();
    expect(subscription?.unsubscribe).toHaveBeenCalled();
    expect(api.requests.filter((r) => r.method === 'DELETE')).toEqual([
      {
        method: 'DELETE',
        path: '/api/notifications/subscription',
        actingUser: dani.id,
        body: { endpoint: TEST_ENDPOINT },
      },
    ]);
  });

  it('превключвателят записва вида веднага и се връща при грешка', async () => {
    stubPushBrowser({ permission: 'granted', subscribed: true });
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    const thaw = await within(section).findByRole('switch', {
      name: 'Извади месото',
    });
    expect(thaw).toBeChecked();

    await user.click(thaw);
    await waitFor(() => expect(thaw).not.toBeChecked());
    await waitFor(() =>
      expect(api.state.settings).toEqual({
        thaw: false,
        cook: true,
        menu: true,
      }),
    );

    const save = api.failNextSettingsSave();
    const cook = within(section).getByRole('switch', {
      name: 'Кой готви довечера',
    });
    await user.click(cook);
    await waitFor(() => expect(cook).not.toBeChecked());

    save.fail();
    await waitFor(() => expect(cook).toBeChecked());
    expect(thaw).not.toBeChecked();
    expect(await screen.findByText('Нещо се обърка')).toBeInTheDocument();
  });

  it('„Изпрати пробно“ праща пробно известие', async () => {
    stubPushBrowser({ permission: 'granted', subscribed: true });
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(
      await within(await findSection()).findByRole('button', {
        name: 'Изпрати пробно',
      }),
    );

    expect(
      await screen.findByText('Пробното известие тръгна'),
    ).toBeInTheDocument();
    expect(
      api.requests.filter((r) => r.path === '/api/notifications/test'),
    ).toHaveLength(1);
  });

  it('смяна на потребителя изпраща абонамента отново за новия човек', async () => {
    stubPushBrowser({ permission: 'granted', subscribed: true });
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    await within(await findSection()).findByRole('button', {
      name: 'Изключи на това устройство',
    });
    await user.click(screen.getByRole('link', { name: 'Смени' }));
    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    await waitFor(() =>
      expect(
        api.requests.filter(
          (r) => r.method === 'PUT' && r.path.endsWith('/subscription'),
        ),
      ).toEqual([
        expect.objectContaining({
          actingUser: poli.id,
          body: expect.objectContaining({ endpoint: TEST_ENDPOINT }),
        }),
      ]),
    );
  });

  it('без абонамент смяната на потребителя не праща нищо', async () => {
    stubPushBrowser();
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/settings');

    await within(await findSection()).findByRole('button', {
      name: 'Включи известия на това устройство',
    });
    await user.click(screen.getByRole('link', { name: 'Смени' }));
    await user.click(await screen.findByRole('button', { name: 'Поли' }));
    await user.click(await screen.findByRole('button', { name: 'По-късно' }));
    await screen.findByRole('region', { name: 'Днес накратко' });

    expect(api.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('api без VAPID ключове: раздел без бутони, с кратко обяснение', async () => {
    stubPushBrowser();
    servePushApi({ disabled: true });
    renderApp('/settings');

    const section = await findSection();
    expect(
      await within(section).findByText('Известията не са включени на сървъра.'),
    ).toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
  });

  it('браузър без Web Push: раздел без бутони, с кратко обяснение', async () => {
    renderApp('/settings');

    const section = await findSection();
    expect(
      await within(section).findByText(/не поддържа известия/),
    ).toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
  });

  it('kiosk и TV нямат раздел „Известия“', async () => {
    stubPushBrowser({ permission: 'granted', subscribed: true });
    const api = servePushApi();
    setUpDevice('kiosk');
    renderApp('/settings');

    expect(
      await screen.findByRole('heading', { name: 'Настройки' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Известия' }),
    ).not.toBeInTheDocument();
    expect(api.requests).toEqual([]);
  });
});
