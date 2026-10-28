import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { dani } from '../test/msw';
import { renderApp, setUpDevice } from '../test/render';

const LABELS = [
  'Дашборд',
  'Календар',
  'Рецепти',
  'Меню',
  'Пазаруване',
  'Килер',
  'Настройки',
];

describe('MainNav на телефона', () => {
  beforeEach(() => {
    setUpDevice('phone', dani.id);
  });

  it('седем екрана, всеки с икона и достъпно име, текущият е отбелязан', async () => {
    renderApp('/settings');

    const nav = await screen.findByRole('navigation', {
      name: 'Основна навигация',
    });
    const links = within(nav).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(LABELS);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([
      ...Array(6).fill(null),
      'page',
    ]);
    for (const label of LABELS) {
      const link = within(nav).getByRole('link', { name: label });
      expect(link.querySelector('svg')).not.toBeNull();
    }
  });
});
