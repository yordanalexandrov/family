import type { Ingredient, Recipe, RecipeInput } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import {
  chicken,
  chickenWithRice,
  ingredients,
  omelette,
  salt,
} from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const mint: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000009',
  name: 'джоджен',
  unit: 'g',
  aisle: 'produce',
};

/** Autocomplete по seed-а (ILIKE) и запис на рецепта; връща телата, които са стигнали до api. */
function serveForm() {
  const saved: { method: string; body: RecipeInput }[] = [];
  const stored = (): Recipe => ({
    ...omelette,
    ...saved.at(-1)?.body,
    ingredients: [],
  });
  server.use(
    http.get('/api/ingredients', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({
        ingredients: ingredients.filter((i) => i.name.includes(q)),
      });
    }),
    http.post('/api/recipes', async ({ request }) => {
      const body = (await request.json()) as RecipeInput;
      saved.push({ method: 'POST', body });
      return HttpResponse.json({ recipe: stored() }, { status: 201 });
    }),
    http.get(`/api/recipes/${omelette.id}`, () =>
      HttpResponse.json({ recipe: stored() }),
    ),
  );
  return saved;
}

function ingredientRow(index: number) {
  return screen.getAllByRole('group', { name: /^Продукт \d+$/ })[
    index
  ] as HTMLElement;
}

describe('RecipeForm', () => {
  it('попълване с избор от autocomplete праща POST /api/recipes с правилното тяло', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const saved = serveForm();

    renderApp('/recipes/new');

    await user.type(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
      'Пилешка супа',
    );
    await user.clear(screen.getByRole('textbox', { name: 'Порции' }));
    await user.type(screen.getByRole('textbox', { name: 'Порции' }), '6');
    await user.type(screen.getByRole('textbox', { name: 'Време (мин)' }), '50');
    await user.click(screen.getByRole('button', { name: 'обяд' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Стъпка 1' }),
      'Свари пилето.',
    );
    await user.click(screen.getByRole('button', { name: 'Добави стъпка' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Стъпка 2' }),
      'Добави фиде.',
    );

    await user.click(screen.getByRole('button', { name: 'Добави продукт' }));
    const row = ingredientRow(0);
    await user.type(
      within(row).getByRole('textbox', { name: 'Продукт' }),
      'пил',
    );
    await user.click(
      await within(row).findByRole('button', { name: 'пилешко филе' }),
    );
    await user.type(
      within(row).getByRole('textbox', { name: 'Количество' }),
      '0,5',
    );
    await user.selectOptions(
      within(row).getByRole('combobox', { name: 'Единица' }),
      'кг',
    );

    await user.click(screen.getByRole('button', { name: 'Запази' }));

    expect(
      await screen.findByRole('heading', { name: 'Пилешка супа' }),
    ).toBeInTheDocument();
    expect(saved).toEqual([
      {
        method: 'POST',
        body: {
          title: 'Пилешка супа',
          servings: 6,
          prepMinutes: 50,
          tags: ['lunch'],
          steps: ['Свари пилето.', 'Добави фиде.'],
          ingredients: [
            { ingredientId: chicken.id, quantity: 0.5, unit: 'kg' },
          ],
        },
      },
    ]);
  });

  it('„Нов продукт“ праща POST /api/ingredients и новият продукт застава в реда', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveForm();
    const created: unknown[] = [];
    server.use(
      http.post('/api/ingredients', async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json({ ingredient: mint }, { status: 201 });
      }),
    );

    renderApp('/recipes/new');
    await user.click(
      await screen.findByRole('button', { name: 'Добави продукт' }),
    );
    const row = ingredientRow(0);
    await user.type(
      within(row).getByRole('textbox', { name: 'Продукт' }),
      'Джоджен',
    );
    await user.click(
      await within(row).findByRole('button', { name: 'Нов продукт' }),
    );
    const form = within(row).getByRole('group', { name: 'Нов продукт' });
    expect(within(form).getByRole('textbox', { name: 'Име' })).toHaveValue(
      'Джоджен',
    );
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'Щанд' }),
      'Плод и зеленчук',
    );
    await user.click(within(form).getByRole('button', { name: 'Създай' }));

    expect(
      await within(row).findByRole('textbox', { name: 'Продукт' }),
    ).toHaveValue('джоджен');
    expect(
      within(row).queryByRole('group', { name: 'Нов продукт' }),
    ).not.toBeInTheDocument();
    // Каноничното име (малки букви) тръгва още от клиента.
    expect(created).toEqual([{ name: 'джоджен', unit: 'g', aisle: 'produce' }]);
  });

  it('при 409 за нов продукт предлага съществуващия', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveForm();
    server.use(
      http.get('/api/ingredients', () =>
        HttpResponse.json({ ingredients: [] }),
      ),
      http.post('/api/ingredients', () =>
        HttpResponse.json(
          {
            error: 'conflict',
            message: 'Вече има такъв продукт',
            ingredient: chicken,
          },
          { status: 409 },
        ),
      ),
    );

    renderApp('/recipes/new');
    await user.click(
      await screen.findByRole('button', { name: 'Добави продукт' }),
    );
    const row = ingredientRow(0);
    await user.type(
      within(row).getByRole('textbox', { name: 'Продукт' }),
      'Пилешко  филе',
    );
    await user.click(
      await within(row).findByRole('button', { name: 'Нов продукт' }),
    );
    await user.selectOptions(
      within(row).getByRole('combobox', { name: 'Щанд' }),
      'Месо и колбаси',
    );
    await user.click(within(row).getByRole('button', { name: 'Създай' }));

    expect(
      await within(row).findByText('Вече има „пилешко филе“, ползвай него'),
    ).toBeInTheDocument();
    await user.click(
      within(row).getByRole('button', { name: 'Избери „пилешко филе“' }),
    );
    expect(within(row).getByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'пилешко филе',
    );
  });

  it('без заглавие не праща и показва грешката под полето', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const saved = serveForm();

    renderApp('/recipes/new');
    await user.type(
      await screen.findByRole('textbox', { name: 'Стъпка 1' }),
      'Нещо.',
    );
    await user.click(screen.getByRole('button', { name: 'Запази' }));

    expect(screen.getByRole('textbox', { name: 'Заглавие' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByRole('textbox', { name: 'Заглавие' }),
    ).toHaveAccessibleDescription('Въведи заглавие');
    expect(saved).toEqual([]);
  });

  it('редакцията зарежда рецептата и праща PUT с промените', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put: RecipeInput[] = [];
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        const body = (await request.json()) as RecipeInput;
        put.push(body);
        const recipe: Recipe = { ...chickenWithRice, title: body.title };
        return HttpResponse.json({ recipe });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    const title = await screen.findByRole('textbox', { name: 'Заглавие' });
    expect(title).toHaveValue('Пиле с ориз');
    await user.clear(title);
    await user.type(title, 'Пиле с ориз на фурна');
    await user.click(screen.getByRole('button', { name: 'Нагоре: стъпка 2' }));
    await user.click(
      screen.getByRole('button', { name: 'Премахни продукт 2' }),
    );
    await user.click(screen.getByRole('button', { name: 'Запази' }));

    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз на фурна' }),
    ).toBeInTheDocument();
    expect(put).toEqual([
      {
        title: 'Пиле с ориз на фурна',
        servings: 4,
        prepMinutes: 45,
        tags: ['lunch', 'kid_friendly'],
        steps: ['Задуши с лука.', 'Нарежи пилето.'],
        sourceUrl: 'https://recepti.example/pile-s-oriz',
        nutritionPer100g: { kcal: 150, proteinG: 12, fatG: 5, carbsG: 14 },
        ingredients: [
          { ingredientId: chicken.id, quantity: 500, unit: 'g' },
          {
            ingredientId: salt.id,
            quantity: null,
            unit: 'pinch',
          },
        ],
      },
    ]);
  });
});
