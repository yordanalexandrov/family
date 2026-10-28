import type {
  RecipeImportDetail,
  RecipeImportParams,
  RecipeImportRequest,
} from '@family/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { importId, pendingImport } from '../../test/imports';
import { dani, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const LINK = 'https://bonapeti.example/recepti/tikvenik';
const WAITING = 'Чета рецептата… обикновено отнема до минута';

const linkImport: RecipeImportRequest = {
  ...pendingImport,
  source: 'url',
  url: LINK,
};

/** `POST /api/recipe-imports` answers in turn (the last repeats); returns what was posted. */
function serveImports(...answers: (() => Response)[]): {
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

function shareUrl(params: Record<string, string>): string {
  return `/recipes/import?${new URLSearchParams(params).toString()}`;
}

describe('Споделяне от Android (share target на /recipes/import)', () => {
  it('`?url=` пуска едно внасяне от линк; презареждане след това не пуска второ', async () => {
    setUpDevice('phone', dani.id);
    const api = serveImports(accepted);

    const first = renderApp(shareUrl({ title: 'Тиквеник', url: LINK }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.posted).toEqual([{ kind: 'url', url: LINK }]);
    const reloaded = first.router.state.location.href;
    expect(reloaded).toBe(`/recipes/import/${importId}`);

    first.unmount();
    renderApp(reloaded);

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.posted).toHaveLength(1);
  });

  it('линк в `text` (както праща Chrome) → внасяне от линк', async () => {
    setUpDevice('phone', dani.id);
    const api = serveImports(accepted);

    renderApp(shareUrl({ title: 'Тиквеник', text: `Виж: ${LINK}` }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.posted).toEqual([{ kind: 'url', url: LINK }]);
  });

  it('само текст → внасяне от текст', async () => {
    setUpDevice('phone', dani.id);
    const api = serveImports(accepted);

    renderApp(shareUrl({ text: 'Тиквеник\nПродукти: 500 г тиква' }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.posted).toEqual([
      { kind: 'text', text: 'Тиквеник\nПродукти: 500 г тиква' },
    ]);
  });

  it('линк, който вече е в регистъра: таб „Линк“ с линка, „Вече е в регистъра“ и „Внеси пак“; презареждане не пуска второ', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const api = serveImports(
      () =>
        HttpResponse.json(
          {
            error: 'already_imported',
            message: 'Вече е в регистъра: Тиквеник',
            recipe: {
              id: 'bbbbbbbb-0000-4000-8000-000000000031',
              title: 'Тиквеник',
            },
          },
          { status: 409 },
        ),
      accepted,
    );

    const first = renderApp(shareUrl({ url: LINK }));

    expect(
      await screen.findByText('Вече е в регистъра: Тиквеник'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Линк' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('textbox', { name: 'Линк към рецептата' }),
    ).toHaveValue(LINK);

    const reloaded = first.router.state.location.href;
    first.unmount();
    renderApp(reloaded);
    expect(
      await screen.findByRole('textbox', { name: 'Линк към рецептата' }),
    ).toHaveValue(LINK);
    expect(api.posted).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Внеси' }));
    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.posted).toEqual([
      { kind: 'url', url: LINK },
      { kind: 'url', url: LINK },
    ]);
  });

  it('`?tab=` (вътрешна навигация, напр. „постави текста“) само попълва, без внасяне', async () => {
    setUpDevice('phone', dani.id);
    const api = serveImports(accepted);

    renderApp(shareUrl({ tab: 'text', url: LINK }));

    expect(
      await screen.findByRole('textbox', {
        name: 'Линк към източника (по желание)',
      }),
    ).toHaveValue(LINK);
    expect(api.posted).toEqual([]);
  });
});
