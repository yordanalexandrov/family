import type { CookingQuestion, Ingredient, Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const product = (id: number, name: string, unit: Ingredient['unit']) => ({
  id: `aaaaaaaa-0000-4000-8000-0000000001${String(id).padStart(2, '0')}`,
  name,
  unit,
  aisle: 'produce' as const,
});

const rice = product(1, 'ориз', 'g');
const basil = product(2, 'босилек', 'g');
const oil = product(3, 'зехтин', 'ml');

const line = (
  ingredient: Ingredient,
  quantity: number,
  component: number | null,
) => ({
  ingredientId: ingredient.id,
  quantity,
  unit: ingredient.unit,
  component,
  ingredient,
});

/** Ризото за 1 с песто за 5 (GLOSSARY: Компонент). */
const risotto: Recipe = {
  ...chickenWithRice,
  id: 'bbbbbbbb-0000-4000-8000-000000000031',
  title: 'Ризото с песто',
  servings: 1,
  steps: [{ text: 'Загрей тигана.' }, { text: 'Смели босилека със зехтина.' }],
  components: [{ name: 'Песто', servings: 5 }],
  ingredients: [line(rice, 80, null), line(basil, 50, 0), line(oil, 100, 0)],
};

function serveRisotto() {
  server.use(
    http.get(`/api/recipes/${risotto.id}`, () =>
      HttpResponse.json({ recipe: risotto }),
    ),
  );
}

/** Текстът на редовете в списъка (името и количеството). */
function names(list: HTMLElement) {
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

const pesto = () => screen.getByRole('region', { name: 'Песто' });

async function click(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  times = 1,
) {
  for (let i = 0; i < times; i += 1) {
    await user.click(screen.getByRole('button', { name }));
  }
}

describe('Готвене с компонент', () => {
  it('компонентът е под заглавието си със свой брояч, а главните редове са в „Продукти“', async () => {
    setUpDevice('kiosk');
    serveRisotto();

    renderApp(`/recipes/${risotto.id}/cook`);

    expect(
      names(await screen.findByRole('list', { name: 'Продукти' })),
    ).toEqual(['ориз80 г']);
    expect(
      within(pesto()).getByRole('heading', { name: 'Песто' }),
    ).toBeInTheDocument();
    expect(within(pesto()).getByText('за 5 порции')).toBeInTheDocument();
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'босилек50 г',
      'зехтин100 мл',
    ]);
  });

  it('броячът на компонента следва главния на цели партиди, докато не е пипан', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRisotto();

    renderApp(`/recipes/${risotto.id}/cook`);
    await screen.findByText('за 1 порция');

    await click(user, 'Една порция повече');
    expect(within(pesto()).getByText('за 5 порции')).toBeInTheDocument();

    await click(user, 'Една порция повече', 4);
    expect(within(pesto()).getByText('за 10 порции')).toBeInTheDocument();
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'босилек100 г',
      'зехтин200 мл',
    ]);

    await click(user, 'Песто: една порция по-малко');
    expect(within(pesto()).getByText('за 9 порции')).toBeInTheDocument();

    await click(user, 'Една порция по-малко', 5);
    expect(screen.getByText('за 1 порция')).toBeInTheDocument();
    expect(within(pesto()).getByText('за 9 порции')).toBeInTheDocument();
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'босилек90 г',
      'зехтин180 мл',
    ]);
    expect(names(screen.getByRole('list', { name: 'Продукти' }))).toEqual([
      'ориз80 г',
    ]);
  });

  it('броячът на компонента не пада под 1 порция', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRisotto();

    renderApp(`/recipes/${risotto.id}/cook`);
    await screen.findByText('за 1 порция');
    await click(user, 'Песто: една порция по-малко', 4);

    expect(within(pesto()).getByText('за 1 порция')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Песто: една порция по-малко' }),
    ).toBeDisabled();
  });

  it('пипнатият брояч на компонента се помни след излизане', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRisotto();

    const first = renderApp(`/recipes/${risotto.id}/cook`);
    await screen.findByText('за 1 порция');
    await click(user, 'Песто: една порция повече', 3);
    await click(user, 'Затвори');
    first.unmount();

    renderApp(`/recipes/${risotto.id}/cook`);
    await screen.findByText('за 1 порция');
    expect(within(pesto()).getByText('за 8 порции')).toBeInTheDocument();

    await click(user, 'Една порция повече', 5);
    expect(within(pesto()).getByText('за 8 порции')).toBeInTheDocument();
  });

  it('ред от компонента се отмята и отива в „Използвани“, а после се връща под компонента', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRisotto();

    renderApp(`/recipes/${risotto.id}/cook`);
    await user.click(
      await screen.findByRole('checkbox', { name: 'босилек 50 г' }),
    );

    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'зехтин100 мл',
    ]);
    await click(user, 'Използвани (1)');
    const used = screen.getByRole('list', { name: 'Използвани' });
    expect(names(used)).toEqual(['босилек50 г']);

    await user.click(
      within(used).getByRole('checkbox', { name: 'босилек 50 г' }),
    );
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'босилек50 г',
      'зехтин100 мл',
    ]);
  });

  it('„Питай“ праща броячите на компонентите, а промяната е за брояча при въпроса', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRisotto();
    const bodies = serveAnswer({
      ingredients: [
        {
          kind: 'replace',
          index: 1,
          ingredient: { name: 'орехи', quantity: 80, unit: 'g' },
        },
      ],
      steps: [],
    });

    renderApp(`/recipes/${risotto.id}/cook`);
    await screen.findByText('за 1 порция');
    await click(user, 'Песто: една порция повече', 5);
    await user.click(screen.getByRole('button', { name: 'Питай' }));
    const sheet = await screen.findByRole('dialog', { name: 'Въпрос' });
    await user.type(
      within(sheet).getByLabelText(/^Твоят въпрос/),
      'Може ли с орехи вместо босилек?',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
    await within(sheet).findByText('вместо босилек: орехи 80 г');
    await user.click(within(sheet).getByRole('button', { name: 'Промени' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(bodies).toEqual([
      expect.objectContaining({ servings: 1, components: [10] }),
    ]);
    // 80 g за песто за 10, т.е. 40 g за 5.
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'орехипроменено80 г',
      'зехтин200 мл',
    ]);
    await click(user, 'Песто: една порция по-малко', 5);
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'орехипроменено40 г',
      'зехтин100 мл',
    ]);
  });

  it('промяна за готвенето на ред от компонента остава под него и се мащабира с брояча му', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRisotto();
    serveAnswer({
      ingredients: [
        {
          kind: 'replace',
          index: 1,
          ingredient: { name: 'орехи', quantity: 40, unit: 'g' },
        },
      ],
      steps: [],
    });

    renderApp(`/recipes/${risotto.id}/cook`);
    await screen.findByText('за 1 порция');
    await user.click(screen.getByRole('button', { name: 'Питай' }));
    const sheet = await screen.findByRole('dialog', { name: 'Въпрос' });
    await user.type(
      within(sheet).getByLabelText(/^Твоят въпрос/),
      'Може ли с орехи вместо босилек?',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
    expect(
      await within(sheet).findByText('вместо босилек: орехи 40 г'),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Промени' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'орехипроменено40 г',
      'зехтин100 мл',
    ]);
    await click(user, 'Песто: една порция повече', 5);
    await click(user, 'Една порция повече', 2);
    expect(names(screen.getByRole('list', { name: 'Песто' }))).toEqual([
      'орехипроменено80 г',
      'зехтин200 мл',
    ]);
  });
});

/** Въпросите за ризотото: всеки е готов веднага, с отговор и `change`; връща телата на заявките. */
function serveAnswer(change: CookingQuestion['change']) {
  const asked = new Map<string, CookingQuestion>();
  const bodies: unknown[] = [];
  server.use(
    http.post(`/api/recipes/${risotto.id}/questions`, async ({ request }) => {
      const body = (await request.json()) as {
        question: string;
        step: number;
        servings: number;
      };
      bodies.push(body);
      const question: CookingQuestion = {
        id: `dddddddd-0000-4000-8000-00000000003${asked.size}`,
        recipeId: risotto.id,
        components: [],
        ...body,
        status: 'pending',
        requestedBy: dani.id,
        createdAt: '2026-11-02T18:00:00.000Z',
      };
      asked.set(question.id, question);
      return HttpResponse.json({ request: question }, { status: 202 });
    }),
    http.get('/api/recipes/questions/:id', ({ params }) => {
      const question = asked.get(String(params.id));
      return HttpResponse.json({
        request: {
          ...question,
          status: 'done',
          answer: 'Да, орехите вървят.',
          change,
          finishedAt: '2026-11-02T18:00:05.000Z',
        },
      });
    }),
  );
  return bodies;
}
