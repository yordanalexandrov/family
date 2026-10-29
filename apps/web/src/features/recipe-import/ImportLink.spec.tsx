import type {
  AlreadyImported,
  RecipeImportDetail,
  RecipeImportParams,
  RecipeImportRequest,
} from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  importedSuggestion,
  importId,
  pendingImport,
} from '../../test/imports';
import { dani, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const LINK = 'https://bonapeti.example/recepti/tikvenik';
const RECIPE_ID = 'bbbbbbbb-0000-4000-8000-000000000031';

const linkImport: RecipeImportRequest = {
  ...pendingImport,
  source: 'url',
  url: LINK,
};

/** `POST /api/recipe-imports` answers in turn (the last repeats); returns what was posted. */
function serveImports(...answers: (() => Response | Promise<Response>)[]): {
  posted: RecipeImportParams[];
} {
  const posted: RecipeImportParams[] = [];
  server.use(
    http.get('/api/recipe-imports', () => HttpResponse.json({ requests: [] })),
    http.post('/api/recipe-imports', async ({ request }) => {
      posted.push((await request.json()) as RecipeImportParams);
      const answer = answers[Math.min(posted.length, answers.length) - 1];
      return answer ? answer() : HttpResponse.error();
    }),
    http.get(`/api/recipe-imports/${importId}`, () =>
      HttpResponse.json({
        request: linkImport,
        ingredients: [],
      } satisfies RecipeImportDetail),
    ),
  );
  return { posted };
}

const accepted = () =>
  HttpResponse.json({ request: linkImport }, { status: 202 });

function alreadyImported(body: Omit<AlreadyImported, 'error'>) {
  return () =>
    HttpResponse.json({ error: 'already_imported', ...body }, { status: 409 });
}

async function submitLink(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Линк' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Линк към рецептата' }),
    LINK,
  );
  await user.click(screen.getByRole('button', { name: 'Внеси' }));
}

describe('ImportScreen: таб „Линк“', () => {
  it('праща линка и отваря изчакването', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const api = serveImports(accepted);

    renderApp('/recipes/import');
    await submitLink(user);

    expect(
      await screen.findByText('Чета рецептата… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(screen.getByText('Линк: bonapeti.example')).toBeInTheDocument();
    expect(api.posted).toEqual([{ kind: 'url', url: LINK }]);
  });

  it('линк, който вече е рецепта: „Вече е в регистъра“ с „Отвори“, а „Внеси пак“ го внася с force', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const api = serveImports(
      alreadyImported({
        message: 'Вече е в регистъра: Тиквеник',
        recipe: { id: RECIPE_ID, title: 'Тиквеник' },
      }),
      accepted,
    );

    renderApp('/recipes/import');
    await submitLink(user);

    expect(
      await screen.findByText('Вече е в регистъра: Тиквеник'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Отвори' })).toHaveAttribute(
      'href',
      `/recipes/${RECIPE_ID}`,
    );
    expect(
      screen.queryByRole('button', { name: 'Внеси' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Внеси пак' }));

    expect(
      await screen.findByText('Чета рецептата… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(api.posted).toEqual([
      { kind: 'url', url: LINK },
      { kind: 'url', url: LINK, force: true },
    ]);
  });

  it('след „Вече е в регистъра“ друг линк връща „Внеси“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const api = serveImports(
      alreadyImported({
        message: 'Вече е в регистъра: Тиквеник',
        recipe: { id: RECIPE_ID, title: 'Тиквеник' },
      }),
      accepted,
    );

    renderApp('/recipes/import');
    await submitLink(user);
    await screen.findByText('Вече е в регистъра: Тиквеник');
    const field = screen.getByRole('textbox', { name: 'Линк към рецептата' });
    await user.clear(field);
    await user.type(field, `${LINK}-2`);

    expect(
      screen.queryByText('Вече е в регистъра: Тиквеник'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Внеси' }));
    expect(
      await screen.findByText('Чета рецептата… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(api.posted).toEqual([
      { kind: 'url', url: LINK },
      { kind: 'url', url: `${LINK}-2` },
    ]);
  });

  it('линк с предложение, което чака: „Вече чака одобрение“, „Отвори“ води към внасянето му', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveImports(
      alreadyImported({
        message: 'Вече чака одобрение: Тиквеник',
        suggestion: {
          id: importedSuggestion.id,
          title: 'Тиквеник',
          importRequestId: importId,
        },
      }),
    );

    renderApp('/recipes/import');
    await submitLink(user);

    expect(
      await screen.findByText('Вече чака одобрение: Тиквеник'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Отвори' })).toHaveAttribute(
      'href',
      `/recipes/import/${importId}`,
    );
  });
});

describe('ImportRequestView: страница, която не се чете', () => {
  function serveFailed(error: 'fetch_blocked' | 'fetch_failed') {
    server.use(
      http.get('/api/recipe-imports', () =>
        HttpResponse.json({ requests: [] }),
      ),
      http.get(`/api/recipe-imports/${importId}`, () =>
        HttpResponse.json({
          request: {
            ...linkImport,
            status: 'failed',
            error,
            finishedAt: '2026-10-27T18:00:05.000Z',
          },
          ingredients: [],
        } satisfies RecipeImportDetail),
      ),
    );
  }

  it('fetch_blocked: „постави текста“ отваря таба „Текст“ с пренесения линк', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveFailed('fetch_blocked');

    renderApp(`/recipes/import/${importId}`);

    expect(
      await screen.findByText(
        'Сайтът не позволява автоматично четене — постави текста.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Опитай пак' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Постави текста' }));

    expect(await screen.findByRole('tab', { name: 'Текст' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('textbox', { name: 'Линк към източника (по желание)' }),
    ).toHaveValue(LINK);
    expect(
      screen.getByRole('textbox', { name: 'Текст на рецептата' }),
    ).toHaveValue('');
    expect(
      screen.getByRole('textbox', { name: 'Текст на рецептата' }),
    ).toHaveFocus();
  });

  it('fetch_failed: „Страницата не се отвори — постави текста“', async () => {
    setUpDevice('phone', dani.id);
    serveFailed('fetch_failed');

    renderApp(`/recipes/import/${importId}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Страницата не се отвори — постави текста.',
    );
    expect(
      within(alert).getByText('Линк: bonapeti.example'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Постави текста' }),
    ).toBeInTheDocument();
  });
});
