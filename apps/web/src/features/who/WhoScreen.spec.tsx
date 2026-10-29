import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { poli } from '../../test/msw';
import { servePushApi, stubPushBrowser } from '../../test/push';
import { renderApp, setUpDevice } from '../../test/render';
import { SERVICE_WORKER_TIMEOUT_MS } from '../settings/push';

describe('WhoScreen', () => {
  beforeEach(() => {
    setUpDevice('phone');
  });

  it('показва „Кой си?“ с аватар за всеки потребител', async () => {
    renderApp('/who');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Дани' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Поли' })).toBeVisible();
    expect(screen.getByText('Д')).toBeInTheDocument();
    expect(screen.getByText('П')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Отметките и гласовете се записват на твое име. Смени по всяко време от Настройки.',
      ),
    ).toBeVisible();
  });

  it('клик на „Поли“ записва id в localStorage и води към дашборда', async () => {
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('family.actingUserId')).toBe(poli.id);
  });
});

describe('„Искаш ли напомняния?“ след „Кой си?“', () => {
  beforeEach(() => {
    setUpDevice('phone');
  });

  it('след избор на човек пита за напомняния с „Включи“ и „По-късно“', async () => {
    stubPushBrowser();
    servePushApi();
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Включи' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'По-късно' })).toBeEnabled();
    expect(localStorage.getItem('family.actingUserId')).toBe(poli.id);
  });

  it('в браузъра пита за напомняния като на телефона', async () => {
    setUpDevice('browser');
    stubPushBrowser();
    servePushApi();
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeInTheDocument();
  });

  it('в браузъра говори за браузъра, не за телефона и Android', async () => {
    setUpDevice('browser');
    stubPushBrowser();
    servePushApi();
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));
    await screen.findByRole('heading', { name: 'Искаш ли напомняния?' });

    expect(screen.getByText(/като известия в този браузър\.$/)).toBeVisible();
    expect(screen.queryByText(/на този телефон/)).toBeNull();
    expect(screen.queryByText(/На Android/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Инсталиране' })).toBeNull();
  });

  it('без активен service worker не чака безкрайно: стъпката дава „По-късно“', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    stubPushBrowser({ noActiveWorker: true });
    servePushApi();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));
    await act(() => vi.advanceTimersByTimeAsync(SERVICE_WORKER_TIMEOUT_MS));

    expect(
      await screen.findByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Включи' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'По-късно' }));
    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
  });

  it('„По-късно“ води към Дашборда и стъпката не се показва повторно', async () => {
    stubPushBrowser();
    servePushApi();
    const user = userEvent.setup();
    const { unmount } = renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));
    await user.click(await screen.findByRole('button', { name: 'По-късно' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();

    unmount();
    renderApp('/who');
    await user.click(await screen.findByRole('button', { name: 'Дани' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeNull();
  });

  it('без поддръжка на известия стъпката се прескача', async () => {
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeNull();
  });

  it('вече включени известия: стъпката се прескача', async () => {
    stubPushBrowser({ permission: 'granted', subscribed: true });
    servePushApi();
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeNull();
  });

  it('„Включи“ казва „Включване…“, абонира устройството и води към Дашборда', async () => {
    const browser = stubPushBrowser({ slowSubscribe: true });
    const api = servePushApi();
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));
    await user.click(await screen.findByRole('button', { name: 'Включи' }));

    expect(
      await screen.findByRole('button', { name: 'Включване…' }),
    ).toBeDisabled();

    browser.finishSubscribe();

    expect(
      await screen.findByText('Известията са включени.'),
    ).toBeInTheDocument();
    expect(
      api.requests.filter(
        (request) =>
          request.method === 'PUT' &&
          request.path === '/api/notifications/subscription',
      ),
    ).toEqual([expect.objectContaining({ actingUser: poli.id })]);

    await user.click(screen.getByRole('button', { name: 'Към Дашборда' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
  });
});

/** Chrome дава `beforeinstallprompt`, когато приложението може да се инсталира; `appinstalled` след инсталиране. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(async () => {
      if (outcome === 'accepted') {
        window.dispatchEvent(new Event('appinstalled'));
      }
    }),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  onTestFinished(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
  return event;
}

describe('инсталиране в „Искаш ли напомняния?“', () => {
  beforeEach(() => {
    setUpDevice('phone');
    stubPushBrowser();
    servePushApi();
  });

  async function openStep() {
    const user = userEvent.setup();
    renderApp('/who');
    await user.click(await screen.findByRole('button', { name: 'Поли' }));
    await screen.findByRole('heading', { name: 'Искаш ли напомняния?' });
    return user;
  }

  it('неинсталирано без предложение от браузъра: подсказка и пътя през менюто', async () => {
    await openStep();

    expect(
      screen.getByText(
        'На Android известията идват в инсталираното приложение.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Меню на браузъра → Инсталирай приложението'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Инсталирай' })).toBeNull();
  });

  it('„Инсталирай“ отваря предложението на браузъра', async () => {
    const user = await openStep();
    const install = offerInstall();

    await user.click(await screen.findByRole('button', { name: 'Инсталирай' }));

    expect(install.prompt).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('Приложението е инсталирано.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Инсталирай' })).toBeNull();
  });

  it('в инсталираното приложение няма подсказка', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    await openStep();

    expect(
      screen.queryByText(
        'На Android известията идват в инсталираното приложение.',
      ),
    ).toBeNull();
  });
});

describe('режим phone без действащ потребител', () => {
  it('всеки екран води към „Кой си?“', async () => {
    setUpDevice('phone');

    renderApp('/calendar');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });

  it('kiosk не иска потребител', async () => {
    setUpDevice('kiosk');

    renderApp('/');

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Кой си?' })).toBeNull();
  });
});
