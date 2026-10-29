import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedAppliances, serveAppliances } from '../../test/appliances';
import { dani } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

async function findSection() {
  return screen.findByRole('region', { name: 'Уреди' });
}

const sousVide = seedAppliances[2];

describe('Настройки → Уреди', () => {
  beforeEach(() => {
    setUpDevice('phone', dani.id);
  });

  it('показва уредите с превключвател; изключването праща PUT и остава изключено', async () => {
    const api = serveAppliances();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    const switches = await within(section).findAllByRole('switch');
    expect(switches).toHaveLength(6);
    const toggle = within(section).getByRole('switch', { name: 'sous vide' });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    await waitFor(() =>
      expect(api.requests).toEqual([
        {
          method: 'PUT',
          path: `/api/appliances/${sousVide?.id}`,
          body: { enabled: false },
        },
      ]),
    );
    expect(api.appliances[2]?.enabled).toBe(false);
  });

  it('„Добави уред“ праща името и уредът се появява последен, включен', async () => {
    const api = serveAppliances();
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    await user.type(
      await within(section).findByRole('textbox', { name: 'Нов уред' }),
      'хлебопекарна',
    );
    await user.click(
      within(section).getByRole('button', { name: 'Добави уред' }),
    );

    const added = await within(section).findByRole('switch', {
      name: 'хлебопекарна',
    });
    expect(added).toBeChecked();
    expect(within(section).getAllByRole('switch').at(-1)).toBe(added);
    expect(api.requests).toEqual([
      {
        method: 'POST',
        path: '/api/appliances',
        body: { name: 'хлебопекарна' },
      },
    ]);
    expect(
      within(section).getByRole('textbox', { name: 'Нов уред' }),
    ).toHaveValue('');
  });

  it('махането праща DELETE и „Върни“ връща уреда със същото име и състояние', async () => {
    const api = serveAppliances(
      seedAppliances.map((a) =>
        a.id === sousVide?.id ? { ...a, enabled: false } : a,
      ),
    );
    const user = userEvent.setup();
    renderApp('/settings');

    const section = await findSection();
    await user.click(
      await within(section).findByRole('button', { name: 'Махни sous vide' }),
    );

    await waitFor(() =>
      expect(
        within(section).queryByRole('switch', { name: 'sous vide' }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Махнах sous vide')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Върни' }));

    const back = await within(section).findByRole('switch', {
      name: 'sous vide',
    });
    expect(back).not.toBeChecked();
    expect(api.requests).toEqual([
      { method: 'DELETE', path: `/api/appliances/${sousVide?.id}` },
      {
        method: 'POST',
        path: '/api/appliances',
        body: { name: 'sous vide', enabled: false },
      },
    ]);
  });

  it('на kiosk няма карта „Уреди“', async () => {
    setUpDevice('kiosk');
    renderApp('/settings');

    await screen.findByRole('heading', { name: 'Настройки' });
    expect(
      screen.queryByRole('region', { name: 'Уреди' }),
    ).not.toBeInTheDocument();
  });
});
