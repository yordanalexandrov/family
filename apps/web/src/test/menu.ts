import {
  daysOfWeek,
  type Meal,
  type MealComment,
  type MealPlan,
  type MenuProposalRequest,
} from '@family/shared';
import { screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { expect } from 'vitest';
import { apiError, dani, poli, server } from './msw';

// Фикстури за менюто (#37). Сряда, 4 ноември 2026 (`fixtureNow`) е в седмицата от 2 ноември.
export const thisWeek = '2026-11-02';
export const nextWeek = '2026-11-09';
export const lastWeek = '2026-10-26';

export const planId = 'eeeeeeee-0000-4000-8000-000000000001';
export const proposalId = 'ffffffff-0000-4000-8000-000000000001';

export const dinnerRecipes = [
  { id: 'a0000000-0000-4000-8000-000000000001', title: 'Пиле с ориз' },
  { id: 'a0000000-0000-4000-8000-000000000002', title: 'Леща чорба' },
  { id: 'a0000000-0000-4000-8000-000000000003', title: 'Мусака' },
  { id: 'a0000000-0000-4000-8000-000000000004', title: 'Риба на фурна' },
  { id: 'a0000000-0000-4000-8000-000000000005', title: 'Паста с доматен сос' },
] as const;

/** Ястие за `date` от плана; без `overrides` е празно, с по една порция за двамата. */
export function meal(
  date: string,
  index: number,
  overrides: Partial<Meal> = {},
): Meal {
  return {
    id: `eeeeeeee-1111-4000-8000-00000000000${index}`,
    planId,
    date,
    slot: 'dinner',
    recipeId: null,
    note: null,
    cookUserId: null,
    servings: { [dani.id]: 1, [poli.id]: 1 },
    why: null,
    recipe: null,
    votes: [],
    commentCount: 0,
    ...overrides,
  };
}

/** Седмица с 7 празни вечери; `meals` подменя ястията по индекс на деня (0 = понеделник). */
export function planFor(
  weekStart: string,
  meals: Record<number, Partial<Meal>> = {},
  overrides: Partial<MealPlan> = {},
): MealPlan {
  return {
    id: planId,
    weekStart,
    summary: null,
    meals: daysOfWeek(weekStart).map((date, day) =>
      meal(date, day, meals[day]),
    ),
    createdBy: dani.id,
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  };
}

export const pendingProposal: MenuProposalRequest = {
  id: proposalId,
  weekStart: thisWeek,
  hint: 'повече риба',
  status: 'pending',
  trigger: 'user',
  requestedBy: dani.id,
  createdAt: '2026-11-04T08:00:00.000Z',
};

/** Предложението на крона в сряда 09:00 за следващата седмица: без подсказка и без потребител. */
export const scheduledProposal: MenuProposalRequest = {
  id: 'ffffffff-0000-4000-8000-000000000002',
  weekStart: nextWeek,
  status: 'pending',
  trigger: 'schedule',
  requestedBy: null,
  createdAt: '2026-11-04T07:00:00.000Z',
};

/**
 * `GET /api/menu/proposals?weekStart=` с поредните състояния на последното предложение на седмицата; последното се
 * повтаря. Без него (handler-ът по подразбиране) седмицата няма предложение.
 */
export function serveWeekProposal(...states: MenuProposalRequest[]) {
  let calls = 0;
  server.use(
    http.get('/api/menu/proposals', ({ request }) => {
      const weekStart = new URL(request.url).searchParams.get('weekStart');
      const proposal = states[Math.min(calls, states.length - 1)];
      if (!proposal || proposal.weekStart !== weekStart) {
        return noProposal();
      }
      calls += 1;
      return HttpResponse.json({ proposal });
    }),
  );
  return () => calls;
}

/** 404 `no_proposal`, както api-то за седмица без предложение. */
export function noProposal() {
  return apiError(
    404,
    'not_found',
    'Няма предложение за меню за тази седмица',
    'no_proposal',
  );
}

/** 404 `no_plan`, както api-то за седмица без план. */
function noPlan() {
  return apiError(404, 'not_found', 'Няма меню за тази седмица', 'no_plan');
}

/**
 * `GET /api/menu/plans?weekStart=` по седмици: седмица без план е 404 `no_plan`, както в api. Връща реда на поисканите
 * седмици.
 */
export function servePlans(plans: Record<string, MealPlan> = {}) {
  const asked: string[] = [];
  server.use(
    http.get('/api/menu/plans', ({ request }) => {
      const weekStart = new URL(request.url).searchParams.get('weekStart');
      if (weekStart === null) {
        return HttpResponse.json({ plans: [] });
      }
      asked.push(weekStart);
      const plan = plans[weekStart];
      return plan ? HttpResponse.json({ plan }) : noPlan();
    }),
  );
  return asked;
}

/** `GET /api/recipes` като регистъра: вечерните рецепти, филтрирани по `q`; връща поисканите query-та. */
export function serveDinnerRecipes() {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get('/api/recipes', ({ request }) => {
      const search = new URL(request.url).searchParams;
      queries.push(search);
      const q = search.get('q')?.toLowerCase() ?? '';
      return HttpResponse.json({
        recipes: dinnerRecipes
          .filter((recipe) => recipe.title.toLowerCase().includes(q))
          .map((recipe) => ({
            ...recipe,
            servings: 4,
            tags: ['dinner'],
            archivedAt: null,
            rating: null,
            openRevision: null,
          })),
      });
    }),
  );
  return queries;
}

/**
 * `PATCH /api/menu/meals/:id` върху ястията на `plan`: прилага тялото като api (`why` се чисти при нова
 * рецепта) и връща ястието. Връща телата на заявките по ред.
 */
export function serveMealUpdates(plan: MealPlan) {
  const patches: { id: string; body: Record<string, unknown> }[] = [];
  server.use(
    http.patch('/api/menu/meals/:id', async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as Record<string, unknown>;
      patches.push({ id, body });
      const current = plan.meals.find((m) => m.id === id);
      if (!current) {
        return HttpResponse.json(
          { error: 'not_found', message: 'Няма такова ястие' },
          { status: 404 },
        );
      }
      const next: Meal = { ...current, ...body };
      if ('recipeId' in body && body.recipeId !== current.recipeId) {
        const recipe = dinnerRecipes.find((r) => r.id === body.recipeId);
        next.recipe = recipe
          ? { title: recipe.title, archivedAt: null, rating: null }
          : null;
        next.why = null;
      }
      plan.meals = plan.meals.map((m) => (m.id === id ? next : m));
      return HttpResponse.json({ meal: next });
    }),
  );
  return patches;
}

/**
 * `POST /api/menu/meals/:id/restore` („Върни“) срещу `plan`: като api-то, ястието получава рецептата, „защо“-то и
 * гласовете, които е имало при извикването (преди махането). Връща id-тата на ястията по ред.
 */
export function serveMealRestores(plan: MealPlan) {
  const kept = new Map(plan.meals.map((m) => [m.id, m]));
  const restores: string[] = [];
  server.use(
    http.post('/api/menu/meals/:id/restore', ({ params }) => {
      const id = String(params.id);
      restores.push(id);
      const current = plan.meals.find((m) => m.id === id);
      const before = kept.get(id);
      if (!current || !before) {
        return HttpResponse.json(
          { error: 'not_found', message: 'Няма такова ястие' },
          { status: 404 },
        );
      }
      const next: Meal = {
        ...current,
        recipeId: before.recipeId,
        recipe: before.recipe,
        why: before.why,
        votes: before.votes,
      };
      plan.meals = plan.meals.map((m) => (m.id === id ? next : m));
      return HttpResponse.json({ meal: next });
    }),
  );
  return restores;
}

/** Гласовете на `dani` и `poli` за ястие; `undefined` е липсващ глас. */
export function votesOf(
  daniVote?: 'up' | 'down',
  poliVote?: 'up' | 'down',
): Meal['votes'] {
  return [
    ...(daniVote ? [{ userId: dani.id, value: daniVote }] : []),
    ...(poliVote ? [{ userId: poli.id, value: poliVote }] : []),
  ];
}

/**
 * `PUT`/`DELETE /api/menu/meals/:id/vote` върху ястията на `plan` като api: гласът на `X-Acting-User` се поставя или
 * маха и се връща ястието. Връща заявките по ред.
 */
export function serveVotes(plan: MealPlan) {
  const requests: { method: string; id: string; body: unknown }[] = [];
  const handle = async (request: Request, id: string) => {
    const body = request.method === 'PUT' ? await request.json() : undefined;
    requests.push({ method: request.method, id, body });
    const userId = request.headers.get('x-acting-user') ?? '';
    const current = plan.meals.find((m) => m.id === id);
    if (!current) {
      return HttpResponse.json(
        { error: 'not_found', message: 'Няма такова ястие' },
        { status: 404 },
      );
    }
    const others = current.votes.filter((vote) => vote.userId !== userId);
    const value = (body as { value?: 'up' | 'down' } | undefined)?.value;
    const next: Meal = {
      ...current,
      votes: value
        ? [...others, { userId, value }].sort((a, b) =>
            a.userId.localeCompare(b.userId),
          )
        : others,
    };
    plan.meals = plan.meals.map((m) => (m.id === id ? next : m));
    return HttpResponse.json({ meal: next });
  };
  server.use(
    http.put('/api/menu/meals/:id/vote', ({ params, request }) =>
      handle(request, String(params.id)),
    ),
    http.delete('/api/menu/meals/:id/vote', ({ params, request }) =>
      handle(request, String(params.id)),
    ),
  );
  return requests;
}

/** Ред от разговора на ястие; `n` прави id-то и минутата на написване (сряда, 4 ноември, 17:0n в София). */
export function threadLine(
  mealId: string,
  n: number,
  overrides: Partial<MealComment> = {},
): MealComment {
  return {
    id: `cccccccc-0000-4000-8000-00000000000${n}`,
    mealId,
    kind: 'comment',
    authorUserId: dani.id,
    body: `коментар ${n}`,
    createdAt: `2026-11-04T15:0${n}:00.000Z`,
    ...overrides,
  };
}

/**
 * Разговорите на ястията на `plan` като api: `GET`/`POST /api/menu/meals/:id/comments` и `DELETE
 * /api/menu/comments/:id` (само свой коментар; 403 за чужд, 409 за системен ред). Брояч и последен ред се
 * пренасят в ястието. Връща заявките по ред.
 */
export function serveThreads(
  plan: MealPlan,
  threads: Record<string, MealComment[]> = {},
) {
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let next = 0;
  const sync = (mealId: string) => {
    const lines = threads[mealId] ?? [];
    plan.meals = plan.meals.map((m) => {
      if (m.id !== mealId) {
        return m;
      }
      const { lastComment: _last, ...rest } = m;
      const last = lines.at(-1);
      return {
        ...rest,
        commentCount: lines.length,
        ...(last ? { lastComment: last } : {}),
      };
    });
  };
  server.use(
    http.get('/api/menu/meals/:id/comments', ({ params, request }) => {
      requests.push({ method: 'GET', path: new URL(request.url).pathname });
      return HttpResponse.json({ comments: threads[String(params.id)] ?? [] });
    }),
    http.post('/api/menu/meals/:id/comments', async ({ params, request }) => {
      const body = (await request.json()) as { body: string };
      const mealId = String(params.id);
      requests.push({
        method: 'POST',
        path: new URL(request.url).pathname,
        body,
      });
      next += 1;
      const comment: MealComment = {
        id: `dddddddd-0000-4000-8000-00000000000${next}`,
        mealId,
        kind: 'comment',
        authorUserId: request.headers.get('x-acting-user') ?? '',
        body: body.body.trim(),
        createdAt: '2026-11-04T16:00:00.000Z',
      };
      threads[mealId] = [...(threads[mealId] ?? []), comment];
      sync(mealId);
      return HttpResponse.json({ comment }, { status: 201 });
    }),
    http.delete('/api/menu/comments/:id', ({ params, request }) => {
      requests.push({ method: 'DELETE', path: new URL(request.url).pathname });
      const id = String(params.id);
      for (const [mealId, lines] of Object.entries(threads)) {
        const line = lines.find((l) => l.id === id);
        if (!line) {
          continue;
        }
        if (line.kind === 'system') {
          return HttpResponse.json(
            { error: 'conflict', message: 'Редовете за промените не се трият' },
            { status: 409 },
          );
        }
        if (line.authorUserId !== request.headers.get('x-acting-user')) {
          return HttpResponse.json(
            {
              error: 'forbidden',
              message: 'Можеш да изтриеш само свой коментар',
            },
            { status: 403 },
          );
        }
        threads[mealId] = lines.filter((l) => l.id !== id);
        sync(mealId);
        return new HttpResponse(null, { status: 204 });
      }
      return HttpResponse.json(
        { error: 'not_found', message: 'Няма такъв коментар' },
        { status: 404 },
      );
    }),
  );
  return requests;
}

/**
 * Разгръща сгънатите минали дни на текущата седмица („Пн–Вт (минали)“). Бутонът трябва да е там и сгънат: иначе
 * spec-ът не проверява това, което мисли.
 */
export async function showPastDays(user: UserEvent = userEvent.setup()) {
  const fold = screen.getByRole('button', { name: /\(минали?\)$/ });
  expect(fold).toHaveAttribute('aria-expanded', 'false');
  await user.click(fold);
  expect(fold).toHaveAttribute('aria-expanded', 'true');
}
