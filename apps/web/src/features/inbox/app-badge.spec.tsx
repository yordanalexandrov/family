import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inboxItem, serveInbox } from '../../test/inbox';
import { dani } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

/** Badging API на `navigator`, както го дава Chrome на инсталирано PWA. */
function stubBadging() {
  const badge = {
    setAppBadge: vi.fn(async () => {}),
    clearAppBadge: vi.fn(async () => {}),
  };
  for (const [name, value] of Object.entries(badge)) {
    Object.defineProperty(navigator, name, { value, configurable: true });
  }
  return badge;
}

afterEach(() => {
  for (const name of ['setAppBadge', 'clearAppBadge']) {
    Reflect.deleteProperty(navigator, name);
  }
});

describe('бройката върху иконата на приложението', () => {
  beforeEach(() => {
    setUpDevice('phone', dani.id);
  });

  it('следва непрочетените: слага бройката и я маха след „Всички прочетени“', async () => {
    const badge = stubBadging();
    serveInbox([inboxItem(), inboxItem(), inboxItem({ unread: false })]);

    renderApp('/inbox');

    await vi.waitFor(() =>
      expect(badge.setAppBadge).toHaveBeenLastCalledWith(2),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Всички прочетени' }),
    );
    await vi.waitFor(() => expect(badge.clearAppBadge).toHaveBeenCalled());
  });

  it('без Badging API кутията работи както преди', async () => {
    serveInbox([inboxItem()]);

    renderApp('/inbox');

    expect(
      await screen.findByRole('link', {
        name: 'Входяща кутия · 1 непрочетени',
      }),
    ).toBeInTheDocument();
  });

  it('на kiosk не пипа иконата: там няма чия кутия', async () => {
    const badge = stubBadging();
    setUpDevice('kiosk');

    renderApp('/');

    await screen.findByText('Днес се готви');
    expect(badge.setAppBadge).not.toHaveBeenCalled();
    expect(badge.clearAppBadge).not.toHaveBeenCalled();
  });
});
