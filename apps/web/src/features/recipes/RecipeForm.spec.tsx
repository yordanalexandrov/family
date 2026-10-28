import type { Ingredient, Recipe, RecipeInput } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
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

/** Редовете в списъка „Продукти“, в реда, в който се виждат. */
function ingredientLines() {
  return within(screen.getByRole('list', { name: 'Продукти' })).queryAllByRole(
    'listitem',
  );
}

/** Листът за един ред продукт. */
function lineSheet() {
  return within(screen.getByRole('dialog', { name: 'Продукт' }));
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
    const sheet = lineSheet();
    await user.type(sheet.getByRole('textbox', { name: 'Продукт' }), 'пил');
    await user.click(
      await sheet.findByRole('button', { name: 'пилешко филе' }),
    );
    await user.type(sheet.getByRole('textbox', { name: 'Количество' }), '0,5');
    await user.selectOptions(
      sheet.getByRole('combobox', { name: 'Единица' }),
      'кг',
    );
    await user.click(sheet.getByRole('button', { name: 'Готово' }));

    // Редът е един ред текст, отбелязан като свързан.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const [line] = ingredientLines();
    expect(
      within(line as HTMLElement).getByRole('button', {
        name: 'пилешко филе · 0,5 кг',
      }),
    ).toBeInTheDocument();
    expect(
      within(line as HTMLElement).getByRole('img', { name: 'Свързан' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Количество' }),
    ).not.toBeInTheDocument();

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
    const sheet = lineSheet();
    await user.type(sheet.getByRole('textbox', { name: 'Продукт' }), 'Джоджен');
    await user.click(await sheet.findByRole('button', { name: 'Нов продукт' }));
    const form = within(sheet.getByRole('group', { name: 'Нов продукт' }));
    expect(form.getByRole('textbox', { name: 'Име' })).toHaveValue('Джоджен');
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Щанд' }),
      'Плод и зеленчук',
    );
    await user.click(form.getByRole('button', { name: 'Създай' }));

    expect(await sheet.findByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'джоджен',
    );
    expect(
      sheet.queryByRole('group', { name: 'Нов продукт' }),
    ).not.toBeInTheDocument();
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    expect(
      within(ingredientLines()[0] as HTMLElement).getByRole('img', {
        name: 'Свързан',
      }),
    ).toBeInTheDocument();
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
    const sheet = lineSheet();
    await user.type(
      sheet.getByRole('textbox', { name: 'Продукт' }),
      'Пилешко  филе',
    );
    await user.click(await sheet.findByRole('button', { name: 'Нов продукт' }));
    await user.selectOptions(
      sheet.getByRole('combobox', { name: 'Щанд' }),
      'Месо и колбаси',
    );
    await user.click(sheet.getByRole('button', { name: 'Създай' }));

    expect(
      await sheet.findByText('Вече има „пилешко филе“, ползвай него'),
    ).toBeInTheDocument();
    await user.click(
      sheet.getByRole('button', { name: 'Избери „пилешко филе“' }),
    );
    expect(sheet.getByRole('textbox', { name: 'Продукт' })).toHaveValue(
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

    // Продуктите са редове текст, всички свързани.
    expect(ingredientLines().map((line) => line.textContent)).toEqual([
      'пилешко филе · 500 г✓',
      'лук · 2 бр.✓',
      'сол · по вкус✓',
    ]);
    await user.click(screen.getByRole('button', { name: 'лук · 2 бр.' }));
    await user.click(lineSheet().getByRole('button', { name: 'Премахни ред' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'пилешко филе · 500 г' }),
    );
    const quantity = lineSheet().getByRole('textbox', { name: 'Количество' });
    await user.clear(quantity);
    await user.type(quantity, '700');
    await user.click(lineSheet().getByRole('button', { name: 'Готово' }));
    expect(
      screen.getByRole('button', { name: 'пилешко филе · 700 г' }),
    ).toBeInTheDocument();

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
          { ingredientId: chicken.id, quantity: 700, unit: 'g' },
          {
            ingredientId: salt.id,
            quantity: null,
            unit: 'pinch',
          },
        ],
      },
    ]);
  });

  it('нов ред, затворен без продукт, не остава в списъка', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveForm();

    renderApp('/recipes/new');
    await user.click(
      await screen.findByRole('button', { name: 'Добави продукт' }),
    );
    expect(ingredientLines()).toHaveLength(1);
    await user.click(lineSheet().getByRole('button', { name: 'Готово' }));

    expect(ingredientLines()).toEqual([]);
  });

  it('полето за продукт в листа се превърта към горния край при фокус', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveForm();
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      Element.prototype.scrollIntoView = original;
    });

    renderApp('/recipes/new');
    await user.click(
      await screen.findByRole('button', { name: 'Добави продукт' }),
    );
    const field = lineSheet().getByRole('textbox', { name: 'Продукт' });
    await user.click(field);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(field);
  });
});
