import type { RecipeSuggestParams } from '@family/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { seedAppliances, serveAppliances } from '../../test/appliances';
import { dani, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';
import { doneRequest, pendingRequest, requestId } from '../../test/suggestions';

/** Записва телата на `POST …/requests`; заявката веднага е `pending`. */
function serveRequests() {
  const sent: RecipeSuggestParams[] = [];
  server.use(
    http.get('/api/recipe-suggestions/requests', () =>
      HttpResponse.json({ requests: [doneRequest] }),
    ),
    http.post('/api/recipe-suggestions/requests', async ({ request }) => {
      sent.push((await request.json()) as RecipeSuggestParams);
      return HttpResponse.json({ request: pendingRequest }, { status: 202 });
    }),
    http.get(`/api/recipe-suggestions/requests/${requestId}`, () =>
      HttpResponse.json({ request: pendingRequest, suggestions: [] }),
    ),
  );
  return sent;
}

describe('SuggestForm', () => {
  it('няколко слота, интервала и тага и подсказка → правилното тяло и към заявката', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const sent = serveRequests();

    renderApp('/recipes/suggest');

    await user.click(await screen.findByRole('button', { name: 'Обяд' }));
    await user.click(screen.getByRole('button', { name: 'Вечеря' }));
    await user.click(screen.getByRole('button', { name: 'до 15 мин' }));
    await user.click(screen.getByRole('button', { name: '30–45 мин' }));
    await user.click(screen.getByRole('button', { name: '45–60 мин' }));
    // Второ натискане маха избора.
    await user.click(screen.getByRole('button', { name: '45–60 мин' }));
    await user.click(screen.getByRole('button', { name: 'бързо' }));
    await user.click(screen.getByRole('button', { name: 'подходящо за дете' }));
    expect(screen.getByRole('button', { name: 'Обяд' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Подсказка' }),
      '  нещо с пиле ',
    );
    expect(screen.getByText('14/200')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Поискай предложения' }),
    );

    expect(await screen.findByText(/Търся рецепти/)).toBeInTheDocument();
    expect(sent).toEqual([
      {
        slots: ['lunch', 'dinner'],
        times: ['0-15', '30-45'],
        tags: ['quick', 'kid_friendly'],
        hint: 'нещо с пиле',
      },
    ]);
  });

  it('без слот не праща; без време, тагове и подсказка праща само слота', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const sent = serveRequests();

    renderApp('/recipes/suggest');
    const submit = await screen.findByRole('button', {
      name: 'Поискай предложения',
    });
    expect(submit).toBeDisabled();
    // Слотовете не са сред таговете.
    expect(
      screen.getByRole('group', { name: 'Тагове' }).textContent,
    ).not.toMatch(/закуска|обяд|вечеря/);

    await user.click(screen.getByRole('button', { name: 'Закуска' }));
    await user.click(submit);

    await screen.findByText(/Търся рецепти/);
    expect(sent).toEqual([{ slots: ['breakfast'] }]);
  });

  it('над бутона е редът с включените уреди и води към тях в Настройки', async () => {
    setUpDevice('phone', dani.id);
    serveRequests();
    serveAppliances(
      seedAppliances.map((appliance) =>
        appliance.name === 'sous vide'
          ? { ...appliance, enabled: false }
          : appliance,
      ),
    );

    renderApp('/recipes/suggest');

    const line = await screen.findByText(/^Уреди:/);
    expect(line).toHaveTextContent(
      'Уреди: air fryer, мултикукър, вакуум машина, кухненски робот ×2, пасатор — предпочитани',
    );
    expect(
      screen.getByRole('link', { name: 'Промени уредите' }),
    ).toHaveAttribute('href', '/settings#appliances');
  });

  it('без включени уреди редът го казва', async () => {
    setUpDevice('phone', dani.id);
    serveRequests();
    serveAppliances(
      seedAppliances.map((appliance) => ({ ...appliance, enabled: false })),
    );

    renderApp('/recipes/suggest');

    expect(await screen.findByText('Уреди: няма включени')).toBeInTheDocument();
  });

  it('под формата са последните заявки с линк към тях', async () => {
    setUpDevice('phone', dani.id);
    const limits: (string | null)[] = [];
    serveRequests();
    server.use(
      http.get('/api/recipe-suggestions/requests', ({ request }) => {
        limits.push(new URL(request.url).searchParams.get('limit'));
        return HttpResponse.json({ requests: [doneRequest] });
      }),
    );

    renderApp('/recipes/suggest');

    const link = await screen.findByRole('link', { name: /вечеря/ });
    expect(link).toHaveTextContent('готова');
    expect(link).toHaveAttribute('href', `/recipes/suggest/${requestId}`);
    expect(limits).toEqual(['10']);
  });

  it('503 openclaw_unavailable показва, че AI не е наличен', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRequests();
    server.use(
      http.post('/api/recipe-suggestions/requests', () =>
        HttpResponse.json(
          {
            error: 'openclaw_unavailable',
            message: 'OpenClaw is not configured',
          },
          { status: 503 },
        ),
      ),
    );

    renderApp('/recipes/suggest');
    await user.click(await screen.findByRole('button', { name: 'Обяд' }));
    await user.click(
      screen.getByRole('button', { name: 'Поискай предложения' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI не е на разположение в момента',
    );
  });

  it('регистърът има бутон „Поискай предложения“', async () => {
    setUpDevice('phone', dani.id);
    server.use(
      http.get('/api/recipes', () => HttpResponse.json({ recipes: [] })),
    );

    renderApp('/recipes');

    expect(
      await screen.findByRole('link', { name: 'Поискай предложения' }),
    ).toHaveAttribute('href', '/recipes/suggest');
  });
});
