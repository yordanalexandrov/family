import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render';

describe('DeviceScreen', () => {
  it('без режим на устройството първо пита „Какво е това устройство?“', async () => {
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Какво е това устройство?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Телефон/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Браузър/ })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Таблет в кухнята/ }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Телевизор/ })).toBeVisible();
  });

  it('избор „Телефон“ записва режима и води към „Кой си?“', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: /Телефон/ }));

    expect(localStorage.getItem('family.deviceMode')).toBe('phone');
    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });

  it('избор „Браузър“ записва режима и също води към „Кой си?“', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: /Браузър/ }));

    expect(localStorage.getItem('family.deviceMode')).toBe('browser');
    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });

  it('стрелките местят фокуса между изборите', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const phone = await screen.findByRole('button', { name: /Телефон/ });

    phone.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Браузър/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('button', { name: /Таблет в кухнята/ }),
    ).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /Телевизор/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(
      screen.getByRole('button', { name: /Таблет в кухнята/ }),
    ).toHaveFocus();
  });

  it('?device=tv записва режима, пропуска екрана и маха параметъра от адреса', async () => {
    const { router } = renderApp('/?device=tv');

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Какво е това устройство?' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Кой си?' }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem('family.deviceMode')).toBe('tv');
    expect(router.state.location.search).not.toHaveProperty('device');
  });
});
