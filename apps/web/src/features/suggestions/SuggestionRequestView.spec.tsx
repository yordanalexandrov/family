import type {
  ContractFailure,
  RecipeSuggestParams,
  SuggestionRequestDetail,
} from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';
import {
  doneRequest,
  failedRequest,
  omeletteSuggestionApproved,
  pendingRequest,
  requestId,
  skewersSuggestion,
  soupSuggestion,
  suggestions,
} from '../../test/suggestions';

/** Отговаря на `GET …/requests/:id` с поредните състояния; последното се повтаря. */
function serveDetail(...states: SuggestionRequestDetail[]) {
  let calls = 0;
  server.use(
    http.get(`/api/recipe-suggestions/requests/${requestId}`, () => {
      const state = states[Math.min(calls, states.length - 1)];
      calls += 1;
      return HttpResponse.json(state);
    }),
  );
  return () => calls;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SuggestionRequestView', () => {
  it('докато е pending пита на 3 s; при done показва картите', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setUpDevice('phone', dani.id);
    const calls = serveDetail(
      { request: pendingRequest, suggestions: [] },
      { request: doneRequest, suggestions },
    );

    renderApp(`/recipes/suggest/${requestId}`);

    expect(
      await screen.findByText('Търся рецепти… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Търсено: Вечеря · „нещо с пиле“'),
    ).toBeInTheDocument();
    expect(calls()).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(3000));

    const card = await screen.findByRole('article', {
      name: 'Пилешки шишчета',
    });
    expect(calls()).toBe(2);
    expect(card).toHaveTextContent('25 мин');
    expect(card).toHaveTextContent('вечеря · бързо');
    expect(card).toHaveTextContent('Бързо е и децата го обичат.');
    expect(card).toHaveTextContent('recepti.example');
    expect(card).toHaveTextContent('3 продукта');
    expect(card).toHaveTextContent('1 нов продукт');
    expect(
      within(card).getByRole('link', { name: 'Прегледай' }),
    ).toHaveAttribute(
      'href',
      `/recipes/suggest/${requestId}/${skewersSuggestion.id}`,
    );

    const rejected = screen.getByRole('article', { name: 'Леща чорба' });
    expect(rejected).toHaveTextContent('Отхвърлено');
    expect(rejected).toHaveClass('suggestion-card--rejected');

    const approved = screen.getByRole('article', { name: 'Омлет с билки' });
    expect(approved).toHaveTextContent('zakuski.example');
    expect(approved).not.toHaveTextContent('www.');
    expect(
      within(approved).getByRole('link', { name: 'Към рецептата' }),
    ).toHaveAttribute(
      'href',
      `/recipes/${omeletteSuggestionApproved.recipeId}`,
    );

    // След done вече не пита.
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(calls()).toBe(2);
  });

  it('„Продукти и стъпки“ разгъва бърз преглед само на своята карта и го прибира', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveDetail({ request: doneRequest, suggestions });

    renderApp(`/recipes/suggest/${requestId}`);

    const card = await screen.findByRole('article', {
      name: 'Пилешки шишчета',
    });
    const other = screen.getByRole('article', { name: 'Леща чорба' });
    const toggle = within(card).getByRole('button', {
      name: 'Продукти и стъпки',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('▾');
    expect(
      within(card).queryByRole('list', { name: 'Продукти' }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole('list', { name: 'Стъпки' }),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('▴');
    const preview = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    );
    expect(preview).toBeVisible();
    const products = within(card).getByRole('list', { name: 'Продукти' });
    expect(
      within(products)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['пилешко филе 0,6 кг', 'сумак 1 ч.л. нов', 'сол по вкус']);
    const steps = within(card).getByRole('list', { name: 'Стъпки' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Нарежи пилето.', 'Нанижи и изпечи.']);
    expect(
      within(other).queryByRole('list', { name: 'Продукти' }),
    ).not.toBeInTheDocument();
    expect(
      within(other).getByRole('button', { name: 'Продукти и стъпки' }),
    ).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(card).queryByRole('list', { name: 'Продукти' }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole('list', { name: 'Стъпки' }),
    ).not.toBeInTheDocument();
  });

  it('вечеря над 6 ч се чете в часове и иска подготовка от предния ден', async () => {
    setUpDevice('phone', dani.id);
    const marinated = {
      ...skewersSuggestion,
      id: 'dddddddd-0000-4000-8000-000000000004',
      payload: {
        ...skewersSuggestion.payload,
        title: 'Мариновано свинско',
        prepMinutes: 1020,
        tags: ['dinner' as const],
      },
    };
    const lunch = {
      ...soupSuggestion,
      id: 'dddddddd-0000-4000-8000-000000000005',
      payload: {
        ...soupSuggestion.payload,
        title: 'Бавно готвен боб',
        prepMinutes: 480,
        tags: ['lunch' as const],
      },
    };
    serveDetail({
      request: doneRequest,
      suggestions: [skewersSuggestion, marinated, lunch],
    });

    renderApp(`/recipes/suggest/${requestId}`);

    const card = await screen.findByRole('article', {
      name: 'Мариновано свинско',
    });
    expect(card).toHaveTextContent('17 ч');
    expect(card).toHaveTextContent('иска подготовка от предния ден');
    expect(
      screen.getByRole('article', { name: 'Пилешки шишчета' }),
    ).not.toHaveTextContent('иска подготовка');
    const slowLunch = screen.getByRole('article', { name: 'Бавно готвен боб' });
    expect(slowLunch).toHaveTextContent('8 ч');
    expect(slowLunch).not.toHaveTextContent('иска подготовка');
  });

  it('failed/timeout показва съобщението; „Опитай пак“ пуска нова заявка със същия вход', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveDetail({ request: failedRequest('timeout'), suggestions: [] });
    const sent: RecipeSuggestParams[] = [];
    const retryId = 'cccccccc-0000-4000-8000-000000000002';
    server.use(
      http.post('/api/recipe-suggestions/requests', async ({ request }) => {
        sent.push((await request.json()) as RecipeSuggestParams);
        return HttpResponse.json(
          { request: { ...pendingRequest, id: retryId } },
          { status: 202 },
        );
      }),
      http.get(`/api/recipe-suggestions/requests/${retryId}`, () =>
        HttpResponse.json({
          request: { ...pendingRequest, id: retryId },
          suggestions: [],
        }),
      ),
    );

    renderApp(`/recipes/suggest/${requestId}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'AI не отговори за 3 минути. Опитай пак или с друга подсказка.',
    );
    expect(
      within(alert).getByText('Търсено: Вечеря · „нещо с пиле“'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));

    expect(
      await screen.findByText('Търся рецепти… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      {
        slots: ['dinner'],
        times: ['15-30'],
        tags: ['quick'],
        hint: 'нещо с пиле',
      },
    ]);
  });

  it('търсеното изрежда слотовете, а дълга подсказка е отрязана; без подсказка е само слотът', async () => {
    setUpDevice('phone', dani.id);
    serveDetail({
      request: {
        ...failedRequest('invalid_output'),
        slots: ['breakfast', 'lunch'],
        hint: 'нещо леко и бързо с яйца, сирене и много зеленчуци за децата',
      },
      suggestions: [],
    });

    const { unmount } = renderApp(`/recipes/suggest/${requestId}`);

    expect(
      within(await screen.findByRole('alert')).getByText(
        'Търсено: Закуска, Обяд · „нещо леко и бързо с яйца, сирене и много…“',
      ),
    ).toBeInTheDocument();
    unmount();

    serveDetail({
      request: { ...failedRequest('invalid_output'), hint: undefined },
      suggestions: [],
    });
    renderApp(`/recipes/suggest/${requestId}`);

    expect(
      within(await screen.findByRole('alert')).getByText('Търсено: Вечеря'),
    ).toBeInTheDocument();
  });

  it.each<[ContractFailure, string]>([
    [
      'invalid_output',
      'AI върна отговор, който не мога да прочета. Опитай пак или с друга подсказка.',
    ],
    [
      'no_results',
      'Не намерих подходящи рецепти. Опитай пак или с друга подсказка.',
    ],
    [
      'stale',
      'AI не успя да предложи рецепти: сървърът се рестартира междувременно. Опитай пак или с друга подсказка.',
    ],
    [
      'http_502',
      'AI не е на разположение в момента. Опитай пак или с друга подсказка.',
    ],
  ])('failed/%s показва „%s“', async (code, message) => {
    setUpDevice('phone', dani.id);
    serveDetail({ request: failedRequest(code), suggestions: [] });

    renderApp(`/recipes/suggest/${requestId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});
