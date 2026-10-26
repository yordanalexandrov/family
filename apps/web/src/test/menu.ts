import {
  daysOfWeek,
  type Meal,
  type MealPlan,
  type MenuProposalRequest,
} from '@family/shared';
import { HttpResponse, http } from 'msw';
import { dani, poli, server } from './msw';

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
  requestedBy: dani.id,
  createdAt: '2026-11-04T08:00:00.000Z',
};

function notFound() {
  return HttpResponse.json(
    { error: 'not_found', message: 'Няма меню за тази седмица' },
    { status: 404 },
  );
}

/**
 * `GET /api/menu/plans?weekStart=` по седмици: седмица без план е 404, както в api. Връща реда на поисканите
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
      return plan ? HttpResponse.json({ plan }) : notFound();
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
        next.recipe = recipe ? { title: recipe.title, archivedAt: null } : null;
        next.why = null;
      }
      plan.meals = plan.meals.map((m) => (m.id === id ? next : m));
      return HttpResponse.json({ meal: next });
    }),
  );
  return patches;
}
