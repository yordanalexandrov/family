import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dani } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const KEY = 'family.actingUserId';

/** Браузър, който размазва, без предпочитание за по-малко движение. */
function stubBlurSupport() {
  vi.stubGlobal('CSS', { supports: () => true });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.effects;
  });

  it('на телефона картите са „Кой си“, „Известия“, „Уреди“, „Тема“, „Ефекти“, „Устройство“', async () => {
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    expect(
      screen.getAllByRole('region').map((region) => region.ariaLabel),
    ).toEqual(['Кой си', 'Известия', 'Уреди', 'Тема', 'Ефекти', 'Устройство']);
  });

  it('смяна на темата слага data-theme и я пази в family.theme', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(await screen.findByRole('radio', { name: 'Тъмна' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('family.theme')).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Светла' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('автоматичната тема в 21:00 е тъмна и се сменя сама в 07:00', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 4 ноември 2026, 21:00 в София (UTC+2).
    vi.setSystemTime(new Date('2026-11-04T19:00:00Z'));
    localStorage.setItem('family.theme', 'light');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/settings');

    await user.click(
      await screen.findByRole('radio', { name: 'Автоматично по часа' }),
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('family.theme')).toBe('auto');

    vi.setSystemTime(new Date('2026-11-05T05:00:00Z'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('на телефон без избор е отметнато „Като телефона“ и тъмният телефон дава тъмна тема', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderApp('/settings');

    expect(
      await screen.findByRole('radio', { name: 'Като телефона' }),
    ).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it.each(['kiosk', 'tv'] as const)(
    'на %s темата по системата е „Като устройството“',
    async (mode) => {
      setUpDevice(mode);
      renderApp('/settings');

      expect(
        await screen.findByRole('radio', { name: 'Като устройството' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('radio', { name: 'Като телефона' }),
      ).not.toBeInTheDocument();
    },
  );

  it('в браузъра темата по системата остава „Като телефона“', async () => {
    setUpDevice('browser', dani.id);
    renderApp('/settings');

    expect(
      await screen.findByRole('radio', { name: 'Като телефона' }),
    ).toBeInTheDocument();
  });

  it('„Леки“ слага data-effects="lite", „Пълни“ — full', async () => {
    stubBlurSupport();
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(await screen.findByRole('radio', { name: 'Пълни' }));
    expect(document.documentElement.dataset.effects).toBe('full');

    await user.click(screen.getByRole('radio', { name: 'Леки' }));
    expect(document.documentElement.dataset.effects).toBe('lite');
    expect(localStorage.getItem('family.effects')).toBe('lite');
  });

  it('без размазване в браузъра казва, че ефектите са автоматично леки', async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    renderApp('/settings');

    expect(
      await screen.findByText(/не поддържа размазване.*автоматично леки/),
    ).toBeInTheDocument();
  });

  it('„Телевизор“ без потвърждение не сменя режима', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    await user.click(screen.getByRole('radio', { name: /Телевизор/ }));

    const sheet = screen.getByRole('dialog', { name: 'Телевизор' });
    expect(sheet).toHaveTextContent(
      'Телефонът ще стане телевизор: без навигация и без известия. Продължи?',
    );
    expect(sheet).toHaveTextContent('?device=phone');
    expect(localStorage.getItem('family.deviceMode')).toBe('phone');
    expect(screen.getByRole('radio', { name: /Телефон/ })).toBeChecked();
  });

  it('„Смени“ сменя режима; извън телефона няма „Кой си“', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    await user.click(screen.getByRole('radio', { name: /Телевизор/ }));
    await user.click(screen.getByRole('button', { name: 'Смени' }));

    expect(localStorage.getItem('family.deviceMode')).toBe('tv');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Кой си' }),
    ).not.toBeInTheDocument();
  });

  it('„Откажи“ оставя „Телефон“', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    await user.click(screen.getByRole('radio', { name: /Телевизор/ }));
    await user.click(screen.getByRole('button', { name: 'Откажи' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('family.deviceMode')).toBe('phone');
    expect(screen.getByRole('radio', { name: /Телефон/ })).toBeChecked();
  });

  it('„Таблет в кухнята“ казва как се връща обратно', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    await user.click(screen.getByRole('radio', { name: /Таблет в кухнята/ }));

    expect(
      screen.getByRole('dialog', { name: 'Таблет в кухнята' }),
    ).toHaveTextContent(/зъбчето.*Настройки.*Телефон/);
    expect(localStorage.getItem('family.deviceMode')).toBe('phone');
  });

  it('„Телефон“ казва всичко, което има телефонът', async () => {
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    expect(
      screen.getByRole('radio', {
        name: /Телефон\s*Всичко за един човек: дашборд, календар, рецепти, меню, пазаруване, килер, известия\./,
      }),
    ).toBeInTheDocument();
  });

  it('„Браузър“ се сменя без потвърждение', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Кой си' });

    await user.click(screen.getByRole('radio', { name: /Браузър/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('family.deviceMode')).toBe('browser');
  });

  it('в браузъра има „Кой си“ и „Известия“ като на телефона', async () => {
    setUpDevice('browser', dani.id);
    renderApp('/settings');

    expect(
      await screen.findByRole('region', { name: 'Кой си' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Известия' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Браузър/ })).toBeChecked();
  });

  it('„Кой си“ показва действащия потребител, „Смени“ води към „Кой си?“', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    expect(await screen.findByText('Дани')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Смени' }));

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });

  it('при 400 unknown_acting_user чисти избора и води към „Кой си?“', async () => {
    localStorage.setItem(KEY, '33333333-3333-4333-8333-333333333333');

    renderApp('/settings');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('показва версията на приложението', async () => {
    renderApp('/settings');

    expect(await screen.findByText(/^Версия \S+/)).toBeInTheDocument();
  });
});
