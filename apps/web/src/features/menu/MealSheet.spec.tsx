import type { MealPlan } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  planFor,
  serveDinnerRecipes,
  serveMealRestores,
  serveMealUpdates,
  servePlans,
  serveThreads,
  serveVotes,
  thisWeek,
  threadLine,
  votesOf,
} from '../../test/menu';
import { dani, fixtureNow, poli, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, , moussaka] = dinnerRecipes;

const withRecipe = (recipe: { id: string; title: string }, why?: string) => ({
  recipeId: recipe.id,
  recipe: { title: recipe.title, archivedAt: null, rating: null },
  ...(why ? { why } : {}),
});

/** Отваря листа на ястието от реда му в Меню; `row` е името на реда, `day` — заглавието на листа. */
async function openSheet(plan: MealPlan, row: RegExp, day: string) {
  servePlans({ [thisWeek]: plan });
  serveDinnerRecipes();
  renderApp('/menu');
  const user = userEvent.setup();
  await screen.findByRole('list', { name: 'Вечери' });
  await user.click(screen.getByRole('button', { name: row }));
  return { user, sheet: screen.getByRole('dialog', { name: day }) };
}

describe('MealSheet: прегледът', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('заглавието води към рецептата, а „защо“ е под него; без отделен „Към рецептата“', async () => {
    const plan = planFor(thisWeek, {
      3: withRecipe(moussaka, 'Мусака за четвъртък.'),
    });
    const { sheet } = await openSheet(plan, /Мусака/, 'четвъртък, 5 ноември');

    const title = within(sheet).getByRole('link', { name: 'Мусака' });
    expect(title).toHaveAttribute('href', `/recipes/${moussaka.id}`);
    expect(within(sheet).getByText('Мусака за четвъртък.')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('link', { name: 'Към рецептата' }),
    ).toBeNull();
  });

  it('ден с бележка е с обикновено заглавие, а празен ден — „Още няма ястие“', async () => {
    const plan = planFor(thisWeek, { 3: { note: 'ядем навън' } });
    const { user, sheet } = await openSheet(
      plan,
      /ядем навън/,
      'четвъртък, 5 ноември',
    );
    expect(
      within(sheet).getByRole('heading', { name: 'ядем навън' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('link', { name: 'ядем навън' }),
    ).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: /^пт/ }));
    expect(
      within(
        screen.getByRole('dialog', { name: 'петък, 6 ноември' }),
      ).getByRole('heading', { name: 'Още няма ястие' }),
    ).toBeInTheDocument();
  });
});

describe('MealSheet: гласуването', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('без моя глас листът пита „Става ли за теб?“; след гласа е ред „Гласове“ с двамата, изхода и моя глас', async () => {
    const plan = planFor(thisWeek, {
      3: { ...withRecipe(moussaka), votes: votesOf(undefined, 'down') },
    });
    const votes = serveVotes(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );

    const ask = within(sheet).getByRole('group', { name: 'Става ли за теб?' });
    expect(within(sheet).queryByRole('group', { name: 'Гласове' })).toBeNull();
    await user.click(within(ask).getByRole('button', { name: 'Да' }));

    await expect
      .poll(() => votes)
      .toEqual([
        { method: 'PUT', id: plan.meals[3]?.id, body: { value: 'up' } },
      ]);
    const row = await within(sheet).findByRole('group', { name: 'Гласове' });
    expect(row).toHaveTextContent('Дани: за');
    expect(row).toHaveTextContent('Поли: против');
    expect(row).toHaveTextContent('Да поговорим');
    expect(within(row).getByRole('button', { name: 'Да' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(sheet).queryByRole('group', { name: 'Става ли за теб?' }),
    ).toBeNull();
  });

  it('празен ден е без гласуване', async () => {
    const { sheet } = await openSheet(
      planFor(thisWeek),
      /^чт/,
      'четвъртък, 5 ноември',
    );
    expect(
      within(sheet).queryByRole('group', { name: 'Става ли за теб?' }),
    ).toBeNull();
    expect(within(sheet).queryByRole('group', { name: 'Гласове' })).toBeNull();
  });
});

/** Една стъпка назад в историята (жестът „назад“ на телефона); връща се при нейния `popstate`. */
async function back() {
  const popped = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
  window.history.back();
  await popped;
}

describe('MealSheet: редовете и под-изгледите', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('редовете показват разговора, готвача и порциите (общо и по човек)', async () => {
    const plan = planFor(thisWeek, {
      3: {
        ...withRecipe(moussaka),
        cookUserId: poli.id,
        servings: { [dani.id]: 2, [poli.id]: 1 },
      },
    });
    const thursday = plan.meals[3];
    if (thursday) {
      thursday.commentCount = 2;
      thursday.lastComment = threadLine(thursday.id, 1, {
        authorUserId: poli.id,
        body: 'пак пиле?',
      });
    }
    const { sheet } = await openSheet(plan, /Мусака/, 'четвъртък, 5 ноември');

    expect(
      within(sheet).getByRole('button', { name: /^Разговор/ }),
    ).toHaveTextContent('Поли: пак пиле?💬 2 в разговора');
    expect(
      within(sheet).getByRole('button', { name: /^Готвач/ }),
    ).toHaveTextContent('Поли');
    expect(
      within(sheet).getByRole('button', { name: /^Порции/ }),
    ).toHaveTextContent('3 (Дани 2, Поли 1)');
    expect(
      within(sheet).getByRole('button', { name: '↻ Смени ястието' }),
    ).toBeInTheDocument();
  });

  it('разговор без редове подканва да се пише', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const { sheet } = await openSheet(plan, /Мусака/, 'четвъртък, 5 ноември');

    expect(
      within(sheet).getByRole('button', { name: /^Разговор/ }),
    ).toHaveTextContent('Напиши нещо…');
  });

  it('„Разговор ›“ отваря разговора в листа; „‹ Назад“ връща към прегледа', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const thursday = plan.meals[3]?.id ?? '';
    serveThreads(plan, {
      [thursday]: [threadLine(thursday, 1, { body: 'така по-добре' })],
    });
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );

    await user.click(within(sheet).getByRole('button', { name: /^Разговор/ }));
    const view = within(sheet).getByRole('region', { name: 'Разговор' });
    expect(await within(view).findByText('така по-добре')).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Мусака' })).toBeNull();

    await user.click(within(view).getByRole('button', { name: 'Назад' }));

    expect(
      within(sheet).getByRole('link', { name: 'Мусака' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('region', { name: 'Разговор' }),
    ).toBeNull();
  });

  it('„назад“ на телефона в под-изглед връща към прегледа, а второто „назад“ затваря листа', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    serveThreads(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await user.click(within(sheet).getByRole('button', { name: /^Порции/ }));
    expect(
      within(sheet).getByRole('region', { name: 'Порции' }),
    ).toBeInTheDocument();

    await back();

    await vi.waitFor(() =>
      expect(
        within(sheet).queryByRole('region', { name: 'Порции' }),
      ).toBeNull(),
    );
    expect(screen.getByRole('dialog', { name: 'четвъртък, 5 ноември' })).toBe(
      sheet,
    );

    await back();

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('„Готово“ при отворен под-изглед затваря листа и маха и двата записа от историята', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    const before = window.history.length;
    await user.click(within(sheet).getByRole('button', { name: /^Порции/ }));
    expect(window.history.length).toBe(before + 1);

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    await vi.waitFor(() =>
      expect(window.history.state?.familySheet).toBeUndefined(),
    );
  });

  it('изборът на готвач връща към прегледа с новия готвач', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const patches = serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await user.click(within(sheet).getByRole('button', { name: /^Готвач/ }));

    await user.click(within(sheet).getByRole('button', { name: 'Поли' }));

    expect(
      await within(sheet).findByRole('button', { name: /^Готвач/ }),
    ).toHaveTextContent('Поли');
    expect(patches).toEqual([
      { id: plan.meals[3]?.id, body: { cookUserId: poli.id } },
    ]);
  });

  it('порциите остават отворени, докато не се върнеш', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const patches = serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await user.click(within(sheet).getByRole('button', { name: /^Порции/ }));
    const more = within(sheet).getByRole('button', {
      name: 'Повече порции за Дани',
    });

    await user.click(more);
    await expect.poll(() => patches.length).toBe(1);
    await user.click(more);
    await expect.poll(() => patches.length).toBe(2);

    await user.click(within(sheet).getByRole('button', { name: 'Назад' }));
    expect(
      within(sheet).getByRole('button', { name: /^Порции/ }),
    ).toHaveTextContent('4 (Дани 3, Поли 1)');
  });
});

describe('MealSheet: „Смени ястието“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('събира начините да се смени ястието, а „Махни ястието от деня“ е отделно', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );

    await user.click(
      within(sheet).getByRole('button', { name: '↻ Смени ястието' }),
    );

    const view = within(sheet).getByRole('region', { name: 'Смени ястието' });
    expect(
      within(view)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      '‹ Назад',
      '✨ Предложи друго',
      'Избери от рецептите›',
      'Размени с друг ден›',
      'Бележка към ястието›',
      'Махни ястието от деня',
    ]);
    // Всяко действие се разгъва на място: търсенето още го няма.
    expect(within(view).queryByRole('searchbox')).toBeNull();
  });

  it('изборът от рецептите връща към прегледа с новото заглавие', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const patches = serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await user.click(
      within(sheet).getByRole('button', { name: '↻ Смени ястието' }),
    );

    const pick = within(sheet).getByRole('button', {
      name: 'Избери от рецептите',
    });
    await user.click(pick);
    expect(pick).toHaveAttribute('aria-expanded', 'true');
    await user.click(
      await within(sheet).findByRole('button', { name: /^Пиле с ориз/ }),
    );

    expect(
      await within(sheet).findByRole('link', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
    expect(within(sheet).queryByRole('searchbox')).toBeNull();
    expect(patches).toEqual([
      { id: plan.meals[3]?.id, body: { recipeId: chicken.id } },
    ]);
  });

  it('бележката към ястие с рецепта се записва и връща към прегледа', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const patches = serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await user.click(
      within(sheet).getByRole('button', { name: '↻ Смени ястието' }),
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Бележка към ястието' }),
    );

    await user.type(
      within(sheet).getByRole('textbox', { name: 'Бележка' }),
      'ядем навън',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Запази' }));

    expect(
      await within(sheet).findByRole('button', { name: '↻ Смени ястието' }),
    ).toBeInTheDocument();
    expect(patches).toEqual([
      { id: plan.meals[3]?.id, body: { note: 'ядем навън' } },
    ]);
  });
});

describe('MealSheet: празен ден', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('пита „Какво ще ядем?“ с „✨ Предложи ястие“ и другите начини под него, без „Смени ястието“', async () => {
    const { sheet } = await openSheet(
      planFor(thisWeek),
      /^чт/,
      'четвъртък, 5 ноември',
    );

    const block = within(sheet).getByRole('region', { name: 'Какво ще ядем?' });
    expect(
      within(block)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      '✨ Предложи ястие',
      'Избери от рецептите›',
      'Размени с друг ден›',
      'Бележка вместо ястие›',
    ]);
    expect(
      within(sheet).queryByRole('button', { name: '↻ Смени ястието' }),
    ).toBeNull();
  });

  it('изборът на рецепта прави деня ястие с гласуване', async () => {
    const plan = planFor(thisWeek);
    serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /^чт/,
      'четвъртък, 5 ноември',
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Избери от рецептите' }),
    );
    await user.click(
      await within(sheet).findByRole('button', { name: /^Мусака/ }),
    );

    expect(
      await within(sheet).findByRole('link', { name: 'Мусака' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('region', { name: 'Какво ще ядем?' }),
    ).toBeNull();
    expect(
      within(sheet).getByRole('group', { name: 'Става ли за теб?' }),
    ).toBeInTheDocument();
  });
});

describe('MealSheet без действащ потребител', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('на kiosk (от дашборда, с `?meal=`) листът се чете: готвачът и порциите без „›“, без гласове, разговор и смяна', async () => {
    setUpDevice('kiosk');
    const plan = planFor(thisWeek, {
      3: { ...withRecipe(moussaka), cookUserId: dani.id },
    });
    servePlans({ [thisWeek]: plan });
    renderApp(`/menu?meal=${plan.meals[3]?.id}`);
    const sheet = await screen.findByRole('dialog', {
      name: 'четвъртък, 5 ноември',
    });

    expect(within(sheet).getByText('Готвач').parentElement).toHaveTextContent(
      'Дани',
    );
    expect(within(sheet).getByText('Порции').parentElement).toHaveTextContent(
      '2 (Дани 1, Поли 1)',
    );
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Готово']);
    expect(within(sheet).queryByRole('switch')).toBeNull();
    // Седмицата не е минала: само устройството не сменя менюто.
    expect(sheet).not.toHaveTextContent('Седмицата е минала');
  });
});

/** „↻ Смени ястието ›“ → „Избери от рецептите“ → рецептата `name` от търсенето. */
async function pickFromSearch(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
  name: RegExp,
) {
  const change = within(sheet).queryByRole('button', {
    name: '↻ Смени ястието',
  });
  if (change) await user.click(change);
  await user.click(
    within(sheet).getByRole('button', { name: 'Избери от рецептите' }),
  );
  await user.click(await within(sheet).findByRole('button', { name }));
}

/** „↻ Смени ястието ›“ (ако го има) → „Бележка вместо ястие“ / „Бележка към ястието“ → `text` → „Запази“. */
async function saveNote(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
  text: string,
) {
  const change = within(sheet).queryByRole('button', {
    name: '↻ Смени ястието',
  });
  if (change) await user.click(change);
  await user.click(
    within(sheet).getByRole('button', {
      name: /^Бележка (вместо ястие|към ястието)$/,
    }),
  );
  const field = within(sheet).getByRole('textbox', { name: 'Бележка' });
  await user.clear(field);
  await user.type(field, text);
  await user.click(within(sheet).getByRole('button', { name: 'Запази' }));
}

describe('MealSheet: „✓ Сменено“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('изборът от търсенето показва под заглавието „✓ Сменено (беше „…“)“ с „Върни“', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );

    await pickFromSearch(user, sheet, /^Пиле с ориз/);

    const status = await within(sheet).findByRole('status');
    expect(status).toHaveTextContent('✓ Сменено (беше „Мусака“)');
    expect(
      within(status).getByRole('button', { name: 'Върни' }),
    ).toBeInTheDocument();
  });

  it('на празен ден изборът показва само „✓ Сменено“ с „Върни“', async () => {
    const plan = planFor(thisWeek);
    serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /^чт/,
      'четвъртък, 5 ноември',
    );

    await pickFromSearch(user, sheet, /^Мусака/);

    await within(sheet).findByRole('link', { name: 'Мусака' });
    const status = within(sheet).getByRole('status');
    expect(status).toHaveTextContent(/^✓ СмененоВърни$/);
  });

  it('„Върни“ връща ястието с гласа на другия, без нова смяна, и потвърждението изчезва', async () => {
    const plan = planFor(thisWeek, {
      3: {
        ...withRecipe(moussaka, 'Мусака за четвъртък.'),
        votes: votesOf('up', 'up'),
      },
    });
    const patches = serveMealUpdates(plan);
    const restores = serveMealRestores(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await pickFromSearch(user, sheet, /^Пиле с ориз/);
    const status = await within(sheet).findByRole('status');

    await user.click(within(status).getByRole('button', { name: 'Върни' }));

    await expect.poll(() => restores).toEqual([plan.meals[3]?.id]);
    expect(patches).toHaveLength(1);
    expect(
      await within(sheet).findByRole('link', { name: 'Мусака' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Мусака за четвъртък.')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('group', { name: 'Гласове' }),
    ).toHaveTextContent('Поли: за');
    expect(within(sheet).getByRole('status')).toBeEmptyDOMElement();
  });

  it('отказът на „Върни“ се показва', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    serveMealUpdates(plan);
    server.use(
      http.post('/api/menu/meals/:id/restore', () =>
        HttpResponse.json(
          {
            error: 'conflict',
            message: 'Ястието е сменено отново',
          },
          { status: 409 },
        ),
      ),
    );
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await pickFromSearch(user, sheet, /^Пиле с ориз/);
    const status = await within(sheet).findByRole('status');

    await user.click(within(status).getByRole('button', { name: 'Върни' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Ястието е сменено отново',
    );
    expect(
      within(sheet).getByRole('link', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
  });

  it('след нова бележка е „✓ Сменено (беше „…“)“ без „Върни“', async () => {
    const plan = planFor(thisWeek, { 3: { note: 'ядем навън' } });
    serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /ядем навън/,
      'четвъртък, 5 ноември',
    );
    await saveNote(user, sheet, 'на гости');

    await within(sheet).findByRole('heading', { name: 'на гости' });
    const status = within(sheet).getByRole('status');
    expect(status).toHaveTextContent('✓ Сменено (беше „ядем навън“)');
    expect(within(status).queryByRole('button')).toBeNull();
  });

  it('бележка към ястие с рецепта не сменя заглавието: само „✓ Сменено“', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    const patches = serveMealUpdates(plan);
    const { user, sheet } = await openSheet(
      plan,
      /Мусака/,
      'четвъртък, 5 ноември',
    );
    await saveNote(user, sheet, 'ядем навън');

    await expect.poll(() => patches.length).toBe(1);
    const status = await within(sheet).findByRole('status');
    await vi.waitFor(() => expect(status).toHaveTextContent(/^✓ Сменено$/));
  });
});

describe('MealSheet: „✓ Сменено“ след времето', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('изчезва след около 8 s', async () => {
    const plan = planFor(thisWeek, { 3: withRecipe(moussaka) });
    serveMealUpdates(plan);
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    renderApp('/menu');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('list', { name: 'Вечери' });
    await user.click(screen.getByRole('button', { name: /Мусака/ }));
    const sheet = screen.getByRole('dialog', { name: 'четвъртък, 5 ноември' });
    await pickFromSearch(user, sheet, /^Пиле с ориз/);
    const status = await within(sheet).findByRole('status');
    await vi.waitFor(() => expect(status).toHaveTextContent('✓ Сменено'));

    await act(() => vi.advanceTimersByTimeAsync(7000));
    expect(status).toHaveTextContent('✓ Сменено');
    await act(() => vi.advanceTimersByTimeAsync(1500));

    expect(status).toBeEmptyDOMElement();
  });
});
