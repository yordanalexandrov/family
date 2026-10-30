import type { Ingredient, Recipe, RecipeInput } from '@family/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { goOffline } from '../../test/network';
import {
  chicken,
  chickenWithRice,
  ingredients,
  omelette,
  salt,
} from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import {
  cameraPhoto,
  serveStepPhotoUploads,
  stepPhotoIds,
} from '../../test/step-photos';

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

/** Редовете в списъка „Стъпки“, в реда, в който се виждат. */
function stepLines() {
  return within(screen.getByRole('list', { name: 'Стъпки' }))
    .queryAllByRole('listitem')
    .map((line) => line.textContent);
}

/** Листът за една стъпка. */
function stepSheet() {
  return within(screen.getByRole('dialog', { name: 'Стъпка' }));
}

/** Лентата с основното действие на екрана. */
function actionBar() {
  return within(screen.getByRole('group', { name: 'Действия' }));
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
    await user.click(screen.getByRole('button', { name: 'Добави стъпка' }));
    await user.type(
      stepSheet().getByRole('textbox', { name: 'Стъпка 1' }),
      'Свари пилето.',
    );
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Добави стъпка' }));
    await user.type(
      stepSheet().getByRole('textbox', { name: 'Стъпка 2' }),
      'Добави фиде.',
    );
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

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

    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

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
          steps: [{ text: 'Свари пилето.' }, { text: 'Добави фиде.' }],
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
    await user.click(
      await screen.findByRole('button', { name: 'Добави стъпка' }),
    );
    await user.type(
      stepSheet().getByRole('textbox', { name: 'Стъпка 1' }),
      'Нещо.',
    );
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
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
    // Сървърът пази записаното: презареждането на изгледа след PUT вижда новото заглавие.
    let stored: Recipe = chickenWithRice;
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: stored }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        const body = (await request.json()) as RecipeInput;
        put.push(body);
        stored = { ...chickenWithRice, title: body.title };
        return HttpResponse.json({ recipe: stored });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    // Писането започва, след като и последната начална заявка (уредите) е дошла, а полето се търси наново всеки път:
    // така отговор, дошъл под натоварване, не пререндерира формата насред писането, нито пише в стар елемент.
    const title = () => screen.getByRole('textbox', { name: 'Заглавие' });
    expect(
      await screen.findByRole('option', { name: 'sous vide' }),
    ).toBeInTheDocument();
    expect(title()).toHaveValue('Пиле с ориз');
    await user.clear(title());
    await user.type(title(), 'Пиле с ориз на фурна');
    expect(title()).toHaveValue('Пиле с ориз на фурна');
    await user.click(screen.getByRole('button', { name: 'Задуши с лука.' }));
    await user.click(stepSheet().getByRole('button', { name: 'По-нагоре' }));
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

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

    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    // Първо PUT-ът, после изгледът: при грешка се вижда коя от двете стъпки не е станала.
    await waitFor(() => expect(put).toHaveLength(1));
    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз на фурна' }),
    ).toBeInTheDocument();
    expect(put).toEqual([
      {
        title: 'Пиле с ориз на фурна',
        servings: 4,
        prepMinutes: 45,
        tags: ['lunch', 'kid_friendly'],
        steps: [{ text: 'Задуши с лука.' }, { text: 'Нарежи пилето.' }],
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

  it('уредът се избира и маха в редакцията; махнат от Настройки уред остава избран', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put: RecipeInput[] = [];
    const removed = 'тенджера под налягане (Tefal)';
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({
          recipe: { ...chickenWithRice, appliance: removed },
        }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        const body = (await request.json()) as RecipeInput;
        put.push(body);
        const recipe: Recipe = {
          ...chickenWithRice,
          appliance: body.appliance,
        };
        return HttpResponse.json({ recipe });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    const appliance = await screen.findByRole('combobox', { name: 'Уред' });
    expect(appliance).toHaveDisplayValue('тенджера под налягане');
    await screen.findByRole('option', { name: 'air fryer' });
    await user.selectOptions(appliance, 'air fryer');
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    await screen.findByRole('heading', { name: 'Пиле с ориз' });

    expect(put.at(-1)?.appliance).toBe('air fryer (Cosori CAF-R121-KEU)');

    await user.click(screen.getByRole('link', { name: 'Редактирай' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Уред' }),
      'Без уред',
    );
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    await screen.findByRole('heading', { name: 'Пиле с ориз' });

    expect(put.at(-1)).not.toHaveProperty('appliance');
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

  it('стъпките са номериран списък; листът редактира, мести и маха стъпка, а снимката върви със стъпката', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put: RecipeInput[] = [];
    const cutPhoto = 'eeeeeeee-0000-4000-8000-000000000001';
    const stewPhoto = 'eeeeeeee-0000-4000-8000-000000000002';
    const withPhotos: Recipe = {
      ...chickenWithRice,
      steps: [
        { text: 'Нарежи пилето.', photoId: cutPhoto },
        { text: 'Задуши с лука.', photoId: stewPhoto },
      ],
    };
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: withPhotos }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        const body = (await request.json()) as RecipeInput;
        put.push(body);
        return HttpResponse.json({ recipe: chickenWithRice });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    await screen.findByRole('textbox', { name: 'Заглавие' });
    expect(stepLines()).toEqual(['Нарежи пилето.', 'Задуши с лука.']);
    expect(
      screen.queryByRole('textbox', { name: /Стъпка/ }),
    ).not.toBeInTheDocument();

    // Редакция на текста.
    await user.click(screen.getByRole('button', { name: 'Задуши с лука.' }));
    const text = stepSheet().getByRole('textbox', { name: 'Стъпка 2' });
    expect(text).toHaveValue('Задуши с лука.');
    await user.clear(text);
    await user.type(text, 'Задуши с лука и морков.');
    expect(
      stepSheet().getByRole('button', { name: 'По-надолу' }),
    ).toBeDisabled();
    // Местене: листът следва стъпката.
    await user.click(stepSheet().getByRole('button', { name: 'По-нагоре' }));
    expect(stepSheet().getByRole('textbox', { name: 'Стъпка 1' })).toHaveValue(
      'Задуши с лука и морков.',
    );
    expect(
      stepSheet().getByRole('button', { name: 'По-нагоре' }),
    ).toBeDisabled();
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    expect(stepLines()).toEqual(['Задуши с лука и морков.', 'Нарежи пилето.']);

    // Нова стъпка през същия лист.
    await user.click(screen.getByRole('button', { name: 'Добави стъпка' }));
    await user.type(
      stepSheet().getByRole('textbox', { name: 'Стъпка 3' }),
      'Сервирай.',
    );
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

    // Махане.
    await user.click(screen.getByRole('button', { name: 'Нарежи пилето.' }));
    await user.click(
      stepSheet().getByRole('button', { name: 'Премахни стъпка' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stepLines()).toEqual(['Задуши с лука и морков.', 'Сервирай.']);

    await user.click(screen.getByRole('button', { name: 'Запази' }));
    await vi.waitFor(() => expect(put).toHaveLength(1));
    // Редактираната и преместена стъпка пази своята снимка, а махнатата я отнася със себе си.
    expect(put[0]?.steps).toEqual([
      { text: 'Задуши с лука и морков.', photoId: stewPhoto },
      { text: 'Сервирай.' },
    ]);
  });

  it('„Снимка“ качва снимка на стъпката веднага, „Смени“ я сменя, „Махни“ я маха; „Запази“ ги свързва', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const forms = serveStepPhotoUploads();
    const put: RecipeInput[] = [];
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        put.push((await request.json()) as RecipeInput);
        return HttpResponse.json({ recipe: chickenWithRice });
      }),
    );
    const [first, second] = chickenWithRice.steps.map((step) => step.text);

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    await user.click(await screen.findByRole('button', { name: first }));
    // Камера или галерия: само снимки, без да налага камерата.
    const pick = stepSheet().getByLabelText('Снимка');
    expect(pick).toHaveAttribute('type', 'file');
    expect(pick).toHaveAttribute('accept', 'image/*');
    expect(pick).not.toHaveAttribute('capture');
    await user.upload(pick, cameraPhoto());

    // Качена веднага, смалена като JPEG.
    const photo = await stepSheet().findByRole('img', {
      name: 'Снимката на стъпка 1',
    });
    expect(photo.getAttribute('src')).toMatch(
      new RegExp(`^/api/step-photos/${stepPhotoIds[0]}\\?w=\\d+$`),
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]?.url).toMatch(/\/api\/step-photos$/);
    expect(forms[0]?.files).toEqual([
      expect.objectContaining({ field: 'photo', type: 'image/jpeg' }),
    ]);

    await user.upload(stepSheet().getByLabelText('Смени'), cameraPhoto());
    await waitFor(() =>
      expect(
        stepSheet()
          .getByRole('img', { name: 'Снимката на стъпка 1' })
          .getAttribute('src'),
      ).toContain(stepPhotoIds[1]),
    );
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: second }));
    await user.upload(stepSheet().getByLabelText('Снимка'), cameraPhoto());
    await stepSheet().findByRole('img', { name: 'Снимката на стъпка 2' });
    await user.click(stepSheet().getByRole('button', { name: 'Махни' }));
    expect(
      stepSheet().queryByRole('img', { name: 'Снимката на стъпка 2' }),
    ).not.toBeInTheDocument();
    expect(stepSheet().getByLabelText('Снимка')).toBeEnabled();
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: 'Запази' }));
    await vi.waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.steps.slice(0, 2)).toEqual([
      { text: first, photoId: stepPhotoIds[1] },
      { text: second },
    ]);
  });

  it('без връзка „Снимка“ е изключена и казва „Иска връзка“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
    );
    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    const [first] = chickenWithRice.steps;
    await user.click(await screen.findByRole('button', { name: first?.text }));
    const reconnect = goOffline();
    try {
      const pick = stepSheet().getByLabelText('Снимка');
      expect(pick).toBeDisabled();
      expect(pick).toHaveAccessibleDescription('Иска връзка');
    } finally {
      reconnect();
    }
  });

  it('изпразнена стъпка не се запазва и редът ѝ казва „Стъпката е празна“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put: RecipeInput[] = [];
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        put.push((await request.json()) as RecipeInput);
        return HttpResponse.json({ recipe: chickenWithRice });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    await user.click(
      await screen.findByRole('button', { name: 'Задуши с лука.' }),
    );
    await user.clear(stepSheet().getByRole('textbox', { name: 'Стъпка 2' }));
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Запази' }));

    expect(
      await screen.findByRole('button', {
        name: 'Празна стъпка',
        description: 'Стъпката е празна',
      }),
    ).toBeInTheDocument();
    expect(put).toEqual([]);
  });

  it('грешката изчезва, когато полето е поправено, без ново „Запази“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const saved = serveForm();

    renderApp('/recipes/new');
    await user.click(await screen.findByRole('button', { name: 'Запази' }));
    const title = screen.getByRole('textbox', { name: 'Заглавие' });
    expect(title).toHaveAccessibleDescription('Въведи заглавие');
    expect(screen.getByText('Добави поне една стъпка')).toBeInTheDocument();

    await user.type(title, 'Супа');
    expect(title).not.toHaveAttribute('aria-invalid', 'true');
    expect(title).not.toHaveAccessibleDescription();
    // Стъпките още липсват: тяхната грешка и алармата остават.
    expect(screen.getByText('Добави поне една стъпка')).toBeInTheDocument();
    expect(actionBar().getByRole('alert')).toHaveTextContent(
      'Поправи отбелязаните полета.',
    );

    await user.click(screen.getByRole('button', { name: 'Добави стъпка' }));
    await user.type(
      stepSheet().getByRole('textbox', { name: 'Стъпка 1' }),
      'Свари.',
    );
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    expect(
      screen.queryByText('Добави поне една стъпка'),
    ).not.toBeInTheDocument();
    expect(actionBar().queryByRole('alert')).not.toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('нова стъпка, затворена празна, не остава в списъка; без стъпки записът казва да се добави', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const saved = serveForm();

    renderApp('/recipes/new');
    await user.type(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
      'Супа',
    );
    expect(stepLines()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Добави стъпка' }));
    expect(stepLines()).toHaveLength(1);
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    expect(stepLines()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Запази' }));
    expect(screen.getByText('Добави поне една стъпка')).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('местене и махане на стъпка пазят грешките на другите полета', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const saved = serveForm();

    renderApp('/recipes/new');
    for (const text of ['Първа.', 'Втора.']) {
      await user.click(
        await screen.findByRole('button', { name: 'Добави стъпка' }),
      );
      await user.type(
        stepSheet().getByRole('textbox', { name: /Стъпка/ }),
        text,
      );
      await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    }
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    const title = screen.getByRole('textbox', { name: 'Заглавие' });
    expect(title).toHaveAccessibleDescription('Въведи заглавие');

    await user.click(screen.getByRole('button', { name: 'Втора.' }));
    await user.click(stepSheet().getByRole('button', { name: 'По-нагоре' }));
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    expect(stepLines()).toEqual(['Втора.', 'Първа.']);
    expect(title).toHaveAccessibleDescription('Въведи заглавие');
    expect(actionBar().getByRole('alert')).toHaveTextContent(
      'Поправи отбелязаните полета.',
    );

    await user.click(screen.getByRole('button', { name: 'Първа.' }));
    await user.click(
      stepSheet().getByRole('button', { name: 'Премахни стъпка' }),
    );
    expect(stepLines()).toEqual(['Втора.']);
    expect(title).toHaveAccessibleDescription('Въведи заглавие');
    expect(saved).toEqual([]);
  });

  it('махане на продукт пази грешките на другите полета и редове', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put: RecipeInput[] = [];
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
      http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
        put.push((await request.json()) as RecipeInput);
        return HttpResponse.json({ recipe: chickenWithRice });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    const title = await screen.findByRole('textbox', { name: 'Заглавие' });
    await user.clear(title);
    await user.click(screen.getByRole('button', { name: /^лук/ }));
    const quantity = lineSheet().getByRole('textbox', { name: 'Количество' });
    await user.clear(quantity);
    await user.type(quantity, '-1');
    await user.click(lineSheet().getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    expect(title).toHaveAccessibleDescription('Въведи заглавие');
    expect(
      screen.getByRole('button', { name: /^лук/ }),
    ).toHaveAccessibleDescription('Количеството е положително число');

    await user.click(screen.getByRole('button', { name: /^пилешко филе/ }));
    await user.click(lineSheet().getByRole('button', { name: 'Премахни ред' }));
    expect(ingredientLines()).toHaveLength(2);
    expect(title).toHaveAccessibleDescription('Въведи заглавие');
    expect(
      screen.getByRole('button', { name: /^лук/ }),
    ).toHaveAccessibleDescription('Количеството е положително число');
    expect(
      screen.getByRole('button', { name: /^сол/ }),
    ).not.toHaveAccessibleDescription();
    expect(put).toEqual([]);
  });

  it('ръчно разгънатата хранителна стойност остава разгъната, когато грешката ѝ се поправи', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const saved = serveForm();

    renderApp('/recipes/new');
    const summary = await screen.findByText('Хранителна стойност');
    const details = summary.closest('details');
    await user.click(summary);
    const kcal = screen.getByRole('textbox', { name: 'Енергия (kcal)' });
    await user.type(kcal, '-5');
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    expect(kcal).toHaveAccessibleDescription('Неотрицателно число');

    await user.clear(kcal);
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    // Заглавието още липсва; грешката на енергията я няма.
    expect(kcal).not.toHaveAccessibleDescription('Неотрицателно число');
    expect(details).toHaveAttribute('open');
    expect(saved).toEqual([]);
  });

  it('грешка в сгънатата хранителна стойност я разгъва', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveForm();

    renderApp('/recipes/new');
    const summary = await screen.findByText('Хранителна стойност');
    const details = summary.closest('details');
    await user.click(summary);
    await user.type(
      screen.getByRole('textbox', { name: 'Енергия (kcal)' }),
      '-5',
    );
    await user.click(summary);
    expect(details).not.toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Запази' }));
    expect(details).toHaveAttribute('open');
  });

  it('хранителната стойност е най-долу и сгъната без стойности, разгъната със стойности', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
    );
    serveForm();

    const blank = renderApp('/recipes/new');
    const summary = await screen.findByText('Хранителна стойност');
    const empty = summary.closest('details');
    expect(empty).not.toHaveAttribute('open');
    // След „Стъпки“ във формата.
    expect(
      screen
        .getByRole('list', { name: 'Стъпки' })
        .compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(summary);
    expect(
      screen.getByRole('textbox', { name: 'Енергия (kcal)' }),
    ).toBeVisible();
    blank.unmount();

    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    expect(
      (await screen.findByText('Хранителна стойност')).closest('details'),
    ).toHaveAttribute('open');
    expect(screen.getByRole('textbox', { name: 'Енергия (kcal)' })).toHaveValue(
      '150',
    );
  });
});
