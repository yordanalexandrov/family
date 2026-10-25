import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboard, fixtureNow, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

function slotOf(name: string): HTMLElement | null {
  return screen.getByRole('region', { name }).closest('[data-slot]');
}

describe('TvLayout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('tv');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('няма бутони, връзки и навигация', async () => {
    renderApp('/');

    await screen.findByRole('region', { name: 'Днес накратко' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('началният фокус е на ядрото', async () => {
    renderApp('/');

    await screen.findByRole('region', { name: 'Днес накратко' });
    expect(slotOf('Днес накратко')).toHaveFocus();
  });

  it('стрелките местят фокуса по разположението: бюджет вляво, дни вдясно', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('region', { name: 'Днес накратко' });

    await user.keyboard('{ArrowLeft}');
    expect(slotOf('Бюджет')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(slotOf('Бюджет')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(slotOf('Днес накратко')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(slotOf('Следващите дни')).toHaveFocus();
  });

  it('Enter върху фокусирана карта зарежда данните наново', async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get('/api/dashboard', () => {
        requests += 1;
        return HttpResponse.json(dashboard);
      }),
    );
    renderApp('/');
    await screen.findByRole('region', { name: 'Днес накратко' });
    expect(requests).toBe(1);

    await user.keyboard('{ArrowRight}{Enter}');

    await vi.waitFor(() => expect(requests).toBe(2));
  });

  it('иска wake lock за екрана при mount', async () => {
    const request = vi.fn().mockResolvedValue({
      release: vi.fn(),
      addEventListener: vi.fn(),
    });
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });

    renderApp('/');

    await screen.findByRole('region', { name: 'Днес накратко' });
    expect(request).toHaveBeenCalledWith('screen');
  });
});
