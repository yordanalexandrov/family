import type {
  ApproveSuggestionInput,
  Ingredient,
  Recipe,
  RecipeSuggestion,
} from '@family/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { seedAppliances } from '../../test/fixtures/appliances';
import {
  doneImport,
  importedSuggestion,
  sumac as importedSumac,
  importId,
} from '../../test/imports';
import { dani, server } from '../../test/msw';
import { chicken, ingredients, omelette, salt } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import {
  cameraPhoto,
  serveStepPhotoUploads,
  stepPhotoIds,
} from '../../test/step-photos';
import {
  chickenSkewers,
  doneRequest,
  requestId,
  skewersSuggestion,
  suggestions,
} from '../../test/suggestions';

const sumac: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000010',
  name: 'сумак',
  unit: 'g',
  aisle: 'spices',
};

const coconutMilk: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000011',
  name: 'кокосово мляко',
  unit: 'ml',
  aisle: 'canned',
};

const reviewPath = `/recipes/suggest/${requestId}/${skewersSuggestion.id}`;

/** Заявката с предложенията, търсене на продукти (ILIKE) и одобрение; връща пратените `recipeInput`. */
function serveReview(
  suggestion: RecipeSuggestion = skewersSuggestion,
  known: Ingredient[] = [...ingredients, sumac],
) {
  const approved: ApproveSuggestionInput[] = [];
  const searches: string[] = [];
  const recipeId = 'bbbbbbbb-0000-4000-8000-000000000010';
  const stored = (): Recipe => ({
    ...omelette,
    id: recipeId,
    title: approved.at(-1)?.title ?? omelette.title,
    ingredients: [],
  });
  server.use(
    http.get(`/api/recipe-suggestions/requests/${requestId}`, () =>
      HttpResponse.json({
        request: doneRequest,
        suggestions: [
          approved.length > 0
            ? { ...suggestion, status: 'approved', recipeId }
            : suggestion,
          ...suggestions.slice(1),
        ],
      }),
    ),
    http.get('/api/ingredients', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      searches.push(q);
      return HttpResponse.json({
        ingredients: known.filter((i) => i.name.includes(q)),
      });
    }),
    http.post(
      `/api/recipe-suggestions/${suggestion.id}/approve`,
      async ({ request }) => {
        const body = (await request.json()) as ApproveSuggestionInput;
        approved.push(body);
        const recipe = stored();
        return HttpResponse.json(
          {
            recipe,
            suggestion: {
              ...suggestion,
              status: 'approved',
              recipeId: recipe.id,
            },
          },
          { status: 201 },
        );
      },
    ),
    http.get(`/api/recipes/${recipeId}`, () =>
      HttpResponse.json({ recipe: stored() }),
    ),
  );
  return { approved, searches };
}

/** Отхвърляне на предложението; връща id-тата, стигнали до api. */
function serveReject() {
  const rejected: string[] = [];
  server.use(
    http.post(`/api/recipe-suggestions/${skewersSuggestion.id}/reject`, () => {
      rejected.push(skewersSuggestion.id);
      return HttpResponse.json({
        suggestion: { ...skewersSuggestion, status: 'rejected' },
      });
    }),
  );
  return rejected;
}

/** Редовете в списъка „Продукти“, в реда, в който се виждат. */
function ingredientLines() {
  return within(screen.getByRole('list', { name: 'Продукти' })).getAllByRole(
    'listitem',
  );
}

/** Редовете в списъка „Подготовка“ на формата, като текст. */
function preparationLines() {
  return within(screen.getByRole('list', { name: 'Подготовка' }))
    .queryAllByRole('listitem')
    .map((line) => line.textContent);
}

/** Листът за един ред продукт. */
function lineSheet() {
  return within(screen.getByRole('dialog', { name: 'Продукт' }));
}

/** Предложението за шишчета без нови продукти (одобрява се направо) и със стъпки `steps`. */
function knownSkewers(steps: RecipeSuggestion['payload']['steps']) {
  return {
    ...skewersSuggestion,
    payload: {
      ...chickenSkewers,
      ingredients: chickenSkewers.ingredients.map((line) => ({
        ...line,
        isNew: false,
      })),
      steps,
    },
  } satisfies RecipeSuggestion;
}

/** Адресът на миниатюрата във всеки ред на „Стъпки“ (`undefined` за стъпка без снимка). */
function stepThumbnails() {
  return within(screen.getByRole('list', { name: 'Стъпки' }))
    .getAllByRole('listitem')
    .map((line) => line.querySelector('img')?.getAttribute('src'));
}

/** Листът за една стъпка. */
function stepSheet() {
  return within(screen.getByRole('dialog', { name: 'Стъпка' }));
}

/** Toast-ът със съобщението `text` (в `document.body` има и други toast-ове). */
async function findToast(text: string) {
  const message = await screen.findByText(text, {
    selector: '.toast__message span',
  });
  return within(message.closest<HTMLElement>('.toast') ?? message);
}

/** Лентата с основното действие на екрана. */
function actionBar() {
  return within(screen.getByRole('group', { name: 'Действия' }));
}

describe('SuggestionReview', () => {
  it('новият продукт е отгоре със „Свържи“; след свързване в листа „Одобри“ праща recipeInput в реда на рецептата, връща към предложенията и toast „Отвори“ води към рецептата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { approved, searches } = serveReview();

    renderApp(reviewPath);

    expect(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
    ).toHaveValue('Пилешки шишчета');
    // Познатите по име са свързани (точно съвпадение), новият е отгоре и чака „Свържи“.
    expect(ingredientLines().map((line) => line.textContent)).toEqual([
      'сумак · 1 ч.л.Свържи',
      'пилешко филе · 0,6 кг✓',
      'сол · по вкус✓',
    ]);
    expect(searches).toEqual(expect.arrayContaining(['пилешко филе', 'сол']));
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('href', chickenSkewers.sourceUrl);
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'Свържи „сумак“' }));
    const sheet = lineSheet();
    expect(sheet.getByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'сумак',
    );
    expect(
      sheet.getByText('Нов продукт: избери съществуващ или създай нов'),
    ).toBeInTheDocument();
    await user.click(await sheet.findByRole('button', { name: 'сумак' }));
    await user.click(sheet.getByRole('button', { name: 'Готово' }));

    expect(
      within(ingredientLines()[2] as HTMLElement).getByRole('img', {
        name: 'Свързан',
      }),
    ).toBeInTheDocument();
    expect(approved).toEqual([]);
    expect(actionBar().queryByText(/за свързване/)).not.toBeInTheDocument();
    await user.click(actionBar().getByRole('button', { name: 'Одобри' }));

    // Обратно към заявката: одобреното е отбелязано, другите предложения са там.
    expect(
      await screen.findByRole('heading', { name: 'Предложения' }),
    ).toBeInTheDocument();
    const card = within(
      await screen.findByRole('article', { name: 'Пилешки шишчета' }),
    );
    expect(await card.findByText('Одобрено')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Към рецептата' })).toHaveAttribute(
      'href',
      '/recipes/bbbbbbbb-0000-4000-8000-000000000010',
    );
    // Toast-ът води направо към новата рецепта.
    const toast = await findToast('Рецептата е в регистъра');
    await user.click(toast.getByRole('button', { name: 'Отвори' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Пилешки шишчета' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Предложения' }),
    ).not.toBeInTheDocument();
    expect(approved).toEqual([
      {
        title: 'Пилешки шишчета',
        servings: 4,
        prepMinutes: 25,
        tags: ['dinner', 'quick'],
        steps: [{ text: 'Нарежи пилето.' }, { text: 'Нанижи и изпечи.' }],
        sourceUrl: chickenSkewers.sourceUrl,
        appliance: null,
        preparation: [],
        ingredients: [
          { ingredientId: chicken.id, quantity: 0.6, unit: 'kg' },
          { ingredientId: sumac.id, quantity: 1, unit: 'tsp' },
          { ingredientId: salt.id, quantity: null, unit: 'pinch' },
        ],
      },
    ]);
  });

  it('продукт без съвпадение се създава в диалога с основна единица по рецептата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: [
          // isNew: false, но в регистъра го няма: също е нов.
          { name: 'кокосово мляко', isNew: false, quantity: 0.4, unit: 'l' },
          { name: 'сол', isNew: false, quantity: null, unit: 'pinch' },
        ],
      },
    };
    const { approved } = serveReview(suggestion, ingredients);
    const created: unknown[] = [];
    server.use(
      http.post('/api/ingredients', async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json({ ingredient: coconutMilk }, { status: 201 });
      }),
    );

    renderApp(reviewPath);

    await user.click(
      await screen.findByRole('button', { name: 'Свържи „кокосово мляко“' }),
    );
    const sheet = lineSheet();
    await user.click(await sheet.findByRole('button', { name: 'Нов продукт' }));
    const form = within(sheet.getByRole('group', { name: 'Нов продукт' }));
    expect(form.getByRole('textbox', { name: 'Име' })).toHaveValue(
      'кокосово мляко',
    );
    expect(
      form.getByRole('combobox', { name: 'Основна единица' }),
    ).toHaveDisplayValue('мл');
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Щанд' }),
      'Консерви и буркани',
    );
    await user.click(form.getByRole('button', { name: 'Създай' }));
    expect(await sheet.findByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'кокосово мляко',
    );
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(created).toEqual([
      { name: 'кокосово мляко', unit: 'ml', aisle: 'canned' },
    ]);
    expect(approved[0]?.ingredients).toEqual([
      { ingredientId: coconutMilk.id, quantity: 0.4, unit: 'l' },
      { ingredientId: salt.id, quantity: null, unit: 'pinch' },
    ]);
  });

  it('с несвързан продукт лентата казва колко чакат, а „Одобри“ отваря листа на първия, без да праща', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: [
          { name: 'пилешко филе', isNew: false, quantity: 0.6, unit: 'kg' },
          { name: 'сумак', isNew: true, quantity: 1, unit: 'tsp' },
          { name: 'кокосово мляко', isNew: true, quantity: 0.4, unit: 'l' },
        ],
      },
    };
    const { approved } = serveReview(suggestion);

    renderApp(reviewPath);

    expect(
      await screen.findByText('2 продукта за свързване'),
    ).toBeInTheDocument();
    await user.click(actionBar().getByRole('button', { name: 'Одобри' }));

    const sheet = lineSheet();
    expect(sheet.getByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'сумак',
    );
    // Листът на реда има само своето „Готово“; решението е в лентата.
    expect(
      sheet.queryByRole('button', { name: 'Одобри' }),
    ).not.toBeInTheDocument();
    expect(approved).toEqual([]);

    await user.click(await sheet.findByRole('button', { name: 'сумак' }));
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    expect(actionBar().getByText('1 продукт за свързване')).toBeInTheDocument();
  });

  it('Enter в поле с несвързан продукт отваря листа на първия, като „Одобри“', async () => {
    setUpDevice('phone', dani.id);
    const { approved } = serveReview();

    renderApp(reviewPath);

    const title = await screen.findByRole('textbox', { name: 'Заглавие' });
    const form = (title as HTMLInputElement).form;
    // Enter в поле праща формата с бутона ѝ по подразбиране: „Одобри“ в лентата.
    const approve = actionBar().getByRole('button', { name: 'Одобри' });
    expect(approve).toHaveAttribute('type', 'submit');
    expect((approve as HTMLButtonElement).form).toBe(form);
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(lineSheet().getByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'сумак',
    );
    expect(approved).toEqual([]);
  });

  it('с други грешки „Одобри“ казва в лентата да се поправят полетата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: chickenSkewers.ingredients.map((line) => ({
          ...line,
          isNew: false,
        })),
      },
    };
    const { approved } = serveReview(suggestion);

    renderApp(reviewPath);

    await user.clear(await screen.findByRole('textbox', { name: 'Заглавие' }));
    await user.click(actionBar().getByRole('button', { name: 'Одобри' }));

    expect(actionBar().getByRole('alert')).toHaveTextContent(
      'Поправи отбелязаните полета.',
    );
    expect(screen.getByText('Въведи заглавие')).toBeInTheDocument();
    expect(approved).toEqual([]);
  });

  it('без нови продукти „Одобри“ праща направо, без диалог', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: chickenSkewers.ingredients.map((line) => ({
          ...line,
          isNew: false,
        })),
      },
    };
    const { approved } = serveReview(suggestion);

    renderApp(reviewPath);

    expect(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
    ).toHaveValue('Пилешки шишчета');
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(approved[0]?.ingredients.map((i) => i.ingredientId)).toEqual([
      chicken.id,
      sumac.id,
      salt.id,
    ]);
  });

  it('подготовката от предложението е във формата, поправя се преди одобрението и „Одобри“ я праща', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { approved } = serveReview({
      ...knownSkewers(chickenSkewers.steps),
      payload: {
        ...knownSkewers(chickenSkewers.steps).payload,
        preparation: [
          { kind: 'marinate', text: 'мариновай пилето', minutesBefore: 120 },
          { kind: 'oven', degrees: 220, fan: 'fan', rack: 'high' },
        ],
      },
    });

    renderApp(reviewPath);

    await screen.findByRole('textbox', { name: 'Заглавие' });
    expect(preparationLines()).toEqual([
      '🧂мариновай пилето · 2 ч преди',
      '🔥220° · с вентилатор · горна скара',
    ]);
    await user.click(
      screen.getByRole('button', { name: /220° · с вентилатор/ }),
    );
    const sheet = within(screen.getByRole('dialog', { name: 'Подготовка' }));
    await user.click(sheet.getByRole('radio', { name: 'Без вентилатор' }));
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    expect(preparationLines()).toEqual([
      '🧂мариновай пилето · 2 ч преди',
      '🔥220° · без вентилатор · горна скара',
    ]);
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(approved[0]?.preparation).toEqual([
      { kind: 'marinate', text: 'мариновай пилето', minutesBefore: 120 },
      { kind: 'oven', degrees: 220, fan: 'conventional', rack: 'high' },
    ]);
  });

  it('предложение за уред: значката е в прегледа, уредът е избран във формата и „Одобри“ го праща', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const ninja = seedAppliances[1]?.name ?? '';
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        appliance: ninja,
        ingredients: chickenSkewers.ingredients.map((line) => ({
          ...line,
          isNew: false,
        })),
      },
    };
    const { approved } = serveReview(suggestion);

    renderApp(reviewPath);

    expect(await screen.findByText('🔌 мултикукър')).toBeInTheDocument();
    expect(
      await screen.findByRole('combobox', { name: 'Уред' }),
    ).toHaveDisplayValue('мултикукър');
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(approved[0]?.appliance).toBe(ninja);
  });

  it('значката за уред следва избора във формата: при „Без уред“ я няма, при друг уред показва него', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const ninja = seedAppliances[1]?.name ?? '';
    serveReview({
      ...skewersSuggestion,
      payload: { ...chickenSkewers, appliance: ninja },
    });

    renderApp(reviewPath);

    expect(await screen.findByText('🔌 мултикукър')).toBeInTheDocument();
    const select = await screen.findByRole('combobox', { name: 'Уред' });

    await user.selectOptions(select, 'Без уред');
    expect(screen.queryByText(/🔌/)).not.toBeInTheDocument();

    await user.selectOptions(select, 'мултикукър');
    expect(screen.getByText('🔌 мултикукър')).toBeInTheDocument();
  });

  it('„Отхвърли“ праща reject и връща към предложенията с toast „Отхвърлено · Върни“; „Върни“ го прави пак предложение', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveReview();
    let status: RecipeSuggestion['status'] = 'proposed';
    const calls: string[] = [];
    server.use(
      http.get(`/api/recipe-suggestions/requests/${requestId}`, () =>
        HttpResponse.json({
          request: doneRequest,
          suggestions: [
            { ...skewersSuggestion, status },
            ...suggestions.slice(1),
          ],
        }),
      ),
      http.post(
        `/api/recipe-suggestions/${skewersSuggestion.id}/reject`,
        () => {
          calls.push('reject');
          status = 'rejected';
          return HttpResponse.json({
            suggestion: { ...skewersSuggestion, status },
          });
        },
      ),
      http.post(
        `/api/recipe-suggestions/${skewersSuggestion.id}/restore`,
        () => {
          calls.push('restore');
          status = 'proposed';
          return HttpResponse.json({
            suggestion: { ...skewersSuggestion, status },
          });
        },
      ),
    );

    renderApp(reviewPath);
    await screen.findByRole('textbox', { name: 'Заглавие' });
    expect(
      actionBar()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Отхвърли', 'Откажи', 'Одобри']);
    await user.click(actionBar().getByRole('button', { name: 'Отхвърли' }));

    expect(
      await screen.findByRole('heading', { name: 'Предложения' }),
    ).toBeInTheDocument();
    expect(calls).toEqual(['reject']);
    const toast = await findToast('Отхвърлено');
    const card = within(
      await screen.findByRole('article', { name: 'Пилешки шишчета' }),
    );
    expect(await card.findByText('Отхвърлено')).toBeInTheDocument();

    await user.click(toast.getByRole('button', { name: 'Върни' }));

    expect(calls).toEqual(['reject', 'restore']);
    expect(
      await card.findByRole('link', { name: 'Прегледай' }),
    ).toBeInTheDocument();
    expect(toast.queryByText('Отхвърлено')).not.toBeInTheDocument();
  });

  it('„Отхвърли“ е в лентата и докато продуктите се зареждат', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveReview();
    const rejected = serveReject();
    server.use(
      http.get('/api/ingredients', async () => {
        await delay('infinite');
        return HttpResponse.json({ ingredients: [] });
      }),
    );

    renderApp(reviewPath);
    await screen.findByRole('heading', { name: 'Пилешки шишчета' });
    expect(screen.getByText('Зареждане…')).toBeInTheDocument();
    await user.click(actionBar().getByRole('button', { name: 'Отхвърли' }));

    expect(
      await screen.findByRole('heading', { name: 'Предложения' }),
    ).toBeInTheDocument();
    expect(rejected).toEqual([skewersSuggestion.id]);
  });

  it('лентата показва грешката от последното действие', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: chickenSkewers.ingredients.map((line) => ({
          ...line,
          isNew: false,
        })),
      },
    };
    serveReview(suggestion);
    const failing = (message: string) => () =>
      HttpResponse.json({ error: 'conflict', message }, { status: 409 });
    server.use(
      http.post(
        `/api/recipe-suggestions/${suggestion.id}/reject`,
        failing('Отхвърлянето не мина'),
      ),
      http.post(
        `/api/recipe-suggestions/${suggestion.id}/approve`,
        failing('Одобрението не мина'),
      ),
    );

    renderApp(reviewPath);
    await screen.findByRole('textbox', { name: 'Заглавие' });
    await user.click(actionBar().getByRole('button', { name: 'Отхвърли' }));
    expect(
      await actionBar().findByText('Отхвърлянето не мина'),
    ).toBeInTheDocument();

    await user.click(actionBar().getByRole('button', { name: 'Одобри' }));
    expect(
      await actionBar().findByText('Одобрението не мина'),
    ).toBeInTheDocument();
    expect(
      actionBar().queryByText('Отхвърлянето не мина'),
    ).not.toBeInTheDocument();

    await user.click(actionBar().getByRole('button', { name: 'Отхвърли' }));
    expect(
      await actionBar().findByText('Отхвърлянето не мина'),
    ).toBeInTheDocument();
    expect(
      actionBar().queryByText('Одобрението не мина'),
    ).not.toBeInTheDocument();
  });

  it('снимките на стъпките са в прегледа, при предложение и при внасяне; „Одобри“ праща същите снимки', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const photoId = 'eeeeeeee-0000-4000-8000-000000000031';
    const suggestion = knownSkewers([
      { text: 'Нарежи пилето.', photoId },
      { text: 'Нанижи и изпечи.' },
    ]);
    const { approved } = serveReview(suggestion);
    server.use(
      http.get(`/api/recipe-imports/${importId}`, () =>
        HttpResponse.json({
          request: doneImport,
          suggestion: {
            ...importedSuggestion,
            payload: {
              ...importedSuggestion.payload,
              steps: [
                { text: 'Овкусете пилето.' },
                { text: 'Изпечете го 30 минути.', photoId },
              ],
            },
          },
          ingredients: [chicken, salt, importedSumac],
        }),
      ),
    );

    const imported = renderApp(`/recipes/import/${importId}`);
    await screen.findByRole('textbox', { name: 'Заглавие' });
    expect(stepThumbnails()).toEqual([
      undefined,
      `/api/step-photos/${photoId}?w=240`,
    ]);
    imported.unmount();

    renderApp(reviewPath);
    await screen.findByRole('textbox', { name: 'Заглавие' });
    expect(stepThumbnails()).toEqual([
      `/api/step-photos/${photoId}?w=240`,
      undefined,
    ]);
    await user.click(screen.getByRole('button', { name: 'Нарежи пилето.' }));
    expect(
      stepSheet().getByRole('img', { name: 'Снимката на стъпка 1' }),
    ).toBeInTheDocument();
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(approved[0]?.steps).toEqual([
      { text: 'Нарежи пилето.', photoId },
      { text: 'Нанижи и изпечи.' },
    ]);
  });

  it('преди одобрение снимката на стъпка се сменя, маха и добавя ръчно', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveStepPhotoUploads();
    const { approved } = serveReview(
      knownSkewers([
        {
          text: 'Нарежи пилето.',
          photoId: 'eeeeeeee-0000-4000-8000-000000000031',
        },
        {
          text: 'Нанижи и изпечи.',
          photoId: 'eeeeeeee-0000-4000-8000-000000000032',
        },
        { text: 'Поднеси с лимон.' },
      ]),
    );

    renderApp(reviewPath);
    await user.click(
      await screen.findByRole('button', { name: 'Нарежи пилето.' }),
    );
    await user.upload(stepSheet().getByLabelText('Смени'), cameraPhoto());
    await expect
      .poll(() =>
        stepSheet()
          .getByRole('img', { name: 'Снимката на стъпка 1' })
          .getAttribute('src'),
      )
      .toContain(stepPhotoIds[0]);
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: 'Нанижи и изпечи.' }));
    await user.click(stepSheet().getByRole('button', { name: 'Махни' }));
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: 'Поднеси с лимон.' }));
    await user.upload(stepSheet().getByLabelText('Снимка'), cameraPhoto());
    await stepSheet().findByRole('img', { name: 'Снимката на стъпка 3' });
    await user.click(stepSheet().getByRole('button', { name: 'Готово' }));

    expect(stepThumbnails()).toEqual([
      `/api/step-photos/${stepPhotoIds[0]}?w=240`,
      undefined,
      `/api/step-photos/${stepPhotoIds[1]}?w=240`,
    ]);
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(approved[0]?.steps).toEqual([
      { text: 'Нарежи пилето.', photoId: stepPhotoIds[0] },
      { text: 'Нанижи и изпечи.' },
      { text: 'Поднеси с лимон.', photoId: stepPhotoIds[1] },
    ]);
  });

  it('бележката на агента е с етикет: „Защо:“ при предложение, „AI допусна:“ като предупреждение при внасяне', async () => {
    setUpDevice('phone', dani.id);
    serveReview();
    server.use(
      http.get(`/api/recipe-imports/${importId}`, () =>
        HttpResponse.json({
          request: doneImport,
          suggestion: importedSuggestion,
          ingredients: [chicken, salt, importedSumac],
        }),
      ),
    );

    const suggested = renderApp(reviewPath);
    const why = await screen.findByText('Защо:');
    expect(why.parentElement).toHaveTextContent(`Защо: ${chickenSkewers.why}`);
    expect(screen.queryByText('AI допусна:')).not.toBeInTheDocument();
    suggested.unmount();

    renderApp(`/recipes/import/${importId}`);
    const assumed = await screen.findByText('AI допусна:');
    expect(assumed.parentElement).toHaveTextContent(
      'AI допусна: Порциите не са дадени: по количествата са 4.',
    );
    expect(assumed.parentElement).toHaveClass('suggestion-note--warning');
    expect(screen.queryByText('Защо:')).not.toBeInTheDocument();
    // Внасяне от текст: няма снимка, няма и място за нея.
    expect(
      screen.queryByRole('img', { name: 'Снимката на рецептата' }),
    ).not.toBeInTheDocument();
  });
  describe('рецепта със същото заглавие в регистъра', () => {
    const existing: Recipe = {
      ...omelette,
      id: 'bbbbbbbb-0000-4000-8000-000000000099',
      title: 'пилешко филе със СУМАК',
    };

    it('внасяне: предупреждение с „Отвори“ и „Внеси въпреки това“; основното действие в лентата е „Отвори“ и води към рецептата', async () => {
      const user = userEvent.setup();
      setUpDevice('phone', dani.id);
      server.use(
        http.get(`/api/recipe-imports/${importId}`, () =>
          HttpResponse.json({
            request: doneImport,
            suggestion: {
              ...importedSuggestion,
              duplicateOf: { id: existing.id, title: existing.title },
            },
            ingredients: [chicken, salt, importedSumac],
          }),
        ),
        http.get(`/api/recipes/${existing.id}`, () =>
          HttpResponse.json({ recipe: existing }),
        ),
      );

      renderApp(`/recipes/import/${importId}`);

      const warning = within(
        await screen.findByRole('region', {
          name: 'Има рецепта със същото заглавие',
        }),
      );
      expect(warning.getByRole('link', { name: 'Отвори' })).toHaveAttribute(
        'href',
        `/recipes/${existing.id}`,
      );
      expect(
        warning.getByRole('button', { name: 'Внеси въпреки това' }),
      ).toBeInTheDocument();
      expect(
        actionBar()
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Отхвърли', 'Откажи', 'Отвори']);

      await user.click(actionBar().getByRole('button', { name: 'Отвори' }));

      expect(
        await screen.findByRole('heading', { name: existing.title }),
      ).toBeInTheDocument();
    });

    it('предложение от „Поискай предложения“: „Одобри въпреки това“ (не „Внеси“) маха предупреждението и връща „Одобри“, което праща одобрението', async () => {
      const user = userEvent.setup();
      setUpDevice('phone', dani.id);
      const { approved } = serveReview({
        ...skewersSuggestion,
        duplicateOf: { id: existing.id, title: 'ПИЛЕШКИ шишчета' },
        payload: {
          ...chickenSkewers,
          ingredients: chickenSkewers.ingredients.map((line) => ({
            ...line,
            isNew: false,
          })),
        },
      });

      renderApp(reviewPath);
      const warning = await screen.findByRole('region', {
        name: 'Има рецепта със същото заглавие',
      });
      await screen.findByRole('textbox', { name: 'Заглавие' });
      expect(
        actionBar().queryByRole('button', { name: 'Одобри' }),
      ).not.toBeInTheDocument();

      expect(
        within(warning).queryByRole('button', { name: 'Внеси въпреки това' }),
      ).not.toBeInTheDocument();
      await user.click(
        within(warning).getByRole('button', { name: 'Одобри въпреки това' }),
      );

      expect(warning).not.toBeInTheDocument();
      await user.click(actionBar().getByRole('button', { name: 'Одобри' }));
      await screen.findByRole('heading', { name: 'Предложения' });
      expect(approved).toHaveLength(1);
    });

    /** Внасянето с регистър от `recipes`; `duplicateOf` е по заглавието от агента, както го дава api-то. */
    function serveImportWithRegistry(
      recipes: Recipe[],
      duplicateOf?: RecipeSuggestion['duplicateOf'],
    ) {
      server.use(
        http.get(`/api/recipe-imports/${importId}`, () =>
          HttpResponse.json({
            request: doneImport,
            suggestion: {
              ...importedSuggestion,
              ...(duplicateOf ? { duplicateOf } : {}),
            },
            ingredients: [chicken, salt, importedSumac],
          }),
        ),
        http.get('/api/recipes', () => HttpResponse.json({ recipes })),
      );
    }

    it('друго заглавие във формата маха предупреждението и връща „Одобри“', async () => {
      const user = userEvent.setup();
      setUpDevice('phone', dani.id);
      serveImportWithRegistry([existing], {
        id: existing.id,
        title: existing.title,
      });

      renderApp(`/recipes/import/${importId}`);
      await screen.findByRole('region', {
        name: 'Има рецепта със същото заглавие',
      });
      const title = await screen.findByRole('textbox', { name: 'Заглавие' });
      await user.clear(title);
      await user.type(title, 'Пиле със сумак на тиган');

      expect(
        screen.queryByRole('region', {
          name: 'Има рецепта със същото заглавие',
        }),
      ).not.toBeInTheDocument();
      expect(
        actionBar().getByRole('button', { name: 'Одобри' }),
      ).toBeInTheDocument();
    });

    it('заглавие във формата, което регистърът вече има, показва предупреждението с „Отвори“ към тази рецепта', async () => {
      const user = userEvent.setup();
      setUpDevice('phone', dani.id);
      const moussaka: Recipe = {
        ...omelette,
        id: 'bbbbbbbb-0000-4000-8000-000000000098',
        title: 'Мусака',
      };
      serveImportWithRegistry([existing, moussaka]);

      renderApp(`/recipes/import/${importId}`);
      const title = await screen.findByRole('textbox', { name: 'Заглавие' });
      expect(
        screen.queryByRole('region', {
          name: 'Има рецепта със същото заглавие',
        }),
      ).not.toBeInTheDocument();
      await user.clear(title);
      await user.type(title, '  МУСАКА ');

      const warning = within(
        await screen.findByRole('region', {
          name: 'Има рецепта със същото заглавие',
        }),
      );
      expect(warning.getByRole('link', { name: 'Отвори' })).toHaveAttribute(
        'href',
        `/recipes/${moussaka.id}`,
      );
      expect(
        actionBar().queryByRole('button', { name: 'Одобри' }),
      ).not.toBeInTheDocument();
    });
  });
});
