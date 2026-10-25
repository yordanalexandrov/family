import type {
  RecipeSuggestParams,
  SuggestionFailure,
  SuggestionRequestDetail,
} from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { renderApp } from '../../test/render';
import {
  doneRequest,
  failedRequest,
  omeletteSuggestionApproved,
  pendingRequest,
  requestId,
  skewersSuggestion,
  suggestions,
} from '../../test/suggestions';

const KEY = 'family.actingUserId';

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
    localStorage.setItem(KEY, dani.id);
    const calls = serveDetail(
      { request: pendingRequest, suggestions: [] },
      { request: doneRequest, suggestions },
    );

    renderApp(`/recipes/suggest/${requestId}`);

    expect(
      await screen.findByText('Търся рецепти… обикновено отнема до минута'),
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
    expect(approved).toHaveTextContent('www.zakuski.example');
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

  it('failed/timeout показва съобщението; „Опитай пак“ пуска нова заявка със същия вход', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не успях навреме, опитай пак',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));

    expect(
      await screen.findByText('Търся рецепти… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      { slot: 'dinner', maxMinutes: 30, tags: ['quick'], hint: 'нещо с пиле' },
    ]);
  });

  it.each<[SuggestionFailure, string]>([
    ['invalid_output', 'Получих нечетим отговор'],
    ['stale', 'Сървърът се рестартира, докато търсех. Опитай пак'],
    ['http_502', 'AI отговори с грешка 502, опитай пак'],
  ])('failed/%s показва „%s“', async (code, message) => {
    localStorage.setItem(KEY, dani.id);
    serveDetail({ request: failedRequest(code), suggestions: [] });

    renderApp(`/recipes/suggest/${requestId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});
