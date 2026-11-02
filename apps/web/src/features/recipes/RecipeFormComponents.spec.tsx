import type { Recipe, RecipeInput } from '@family/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

/** Пилето с ориз, а солта е в „Песто“ за 5 порции. */
const withPesto: Recipe = {
  ...chickenWithRice,
  components: [{ name: 'Песто', servings: 5 }],
  ingredients: chickenWithRice.ingredients.map((line, index) => ({
    ...line,
    component: index === 2 ? 0 : null,
  })),
};

/** Редакцията на `recipe`; връща телата на `PUT`-овете. */
function serveEdit(recipe: Recipe = chickenWithRice) {
  const put: RecipeInput[] = [];
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
    http.put(`/api/recipes/${recipe.id}`, async ({ request }) => {
      const body = (await request.json()) as RecipeInput;
      put.push(body);
      return HttpResponse.json({ recipe });
    }),
  );
  return put;
}

async function openEdit() {
  renderApp(`/recipes/${chickenWithRice.id}/edit`);
  // Уредите са последната начална заявка: след тях формата не се пререндерира насред писането.
  expect(
    await screen.findByRole('option', { name: 'sous vide' }),
  ).toBeInTheDocument();
}

/** Редовете на списък продукти (`Продукти` за главните, името на компонента за неговите), като текст. */
function lines(name: string) {
  return within(screen.getByRole('list', { name }))
    .queryAllByRole('listitem')
    .map((line) => line.textContent);
}

function sheet(name: string) {
  return within(screen.getByRole('dialog', { name }));
}

function actionBar() {
  return within(screen.getByRole('group', { name: 'Действия' }));
}

describe('RecipeForm: Компонент', () => {
  it('„+ Компонент“ с име и порции, ред преместен в него; „Запази“ ги праща', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit();
    await openEdit();

    // Без компоненти редът няма избор „Компонент“.
    await user.click(screen.getByRole('button', { name: 'сол · по вкус' }));
    expect(
      sheet('Продукт').queryByRole('combobox', { name: 'Компонент' }),
    ).not.toBeInTheDocument();
    await user.click(sheet('Продукт').getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: '+ Компонент' }));
    await user.type(
      sheet('Компонент').getByRole('textbox', { name: 'Име' }),
      'Песто',
    );
    const servings = sheet('Компонент').getByRole('textbox', {
      name: 'Порции',
    });
    await user.clear(servings);
    await user.type(servings, '5');
    await user.click(
      sheet('Компонент').getByRole('button', { name: 'Готово' }),
    );

    expect(
      screen.getByRole('button', { name: 'Песто · за 5 порции' }),
    ).toBeInTheDocument();
    expect(lines('Песто')).toEqual([]);

    // Компонент без продукти не се записва.
    await user.click(actionBar().getByRole('button', { name: 'Запази' }));
    expect(screen.getByText('Компонентът е без продукти')).toBeInTheDocument();
    expect(put).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'сол · по вкус' }));
    await user.selectOptions(
      sheet('Продукт').getByRole('combobox', { name: 'Компонент' }),
      'Песто',
    );
    await user.click(sheet('Продукт').getByRole('button', { name: 'Готово' }));

    expect(lines('Продукти')).toEqual([
      'пилешко филе · 500 г✓',
      'лук · 2 бр.✓',
    ]);
    expect(lines('Песто')).toEqual(['сол · по вкус✓']);
    expect(
      screen.queryByText('Компонентът е без продукти'),
    ).not.toBeInTheDocument();

    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.components).toEqual([{ name: 'Песто', servings: 5 }]);
    expect(put[0]?.ingredients.map((line) => line.component)).toEqual([
      null,
      null,
      0,
    ]);
  });

  it('ред от компонента се връща при главните с „—“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveEdit(withPesto);
    await openEdit();

    expect(lines('Песто')).toEqual(['сол · по вкус✓']);
    await user.click(screen.getByRole('button', { name: 'сол · по вкус' }));
    const choice = sheet('Продукт').getByRole('combobox', {
      name: 'Компонент',
    });
    expect(choice).toHaveDisplayValue('Песто');
    await user.selectOptions(choice, '—');
    await user.click(sheet('Продукт').getByRole('button', { name: 'Готово' }));

    expect(lines('Продукти')).toEqual([
      'пилешко филе · 500 г✓',
      'лук · 2 бр.✓',
      'сол · по вкус✓',
    ]);
    expect(lines('Песто')).toEqual([]);
  });

  it('преименува компонента и му сменя порциите', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit(withPesto);
    await openEdit();

    await user.click(
      screen.getByRole('button', { name: 'Песто · за 5 порции' }),
    );
    const name = sheet('Компонент').getByRole('textbox', { name: 'Име' });
    await user.clear(name);
    await user.type(name, 'Сос');
    const servings = sheet('Компонент').getByRole('textbox', {
      name: 'Порции',
    });
    await user.clear(servings);
    await user.type(servings, '1');
    await user.click(
      sheet('Компонент').getByRole('button', { name: 'Готово' }),
    );

    expect(
      screen.getByRole('button', { name: 'Сос · за 1 порция' }),
    ).toBeInTheDocument();
    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.components).toEqual([{ name: 'Сос', servings: 1 }]);
  });

  it('махането на компонент връща редовете му при главните', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit(withPesto);
    await openEdit();

    await user.click(
      screen.getByRole('button', { name: 'Песто · за 5 порции' }),
    );
    await user.click(
      sheet('Компонент').getByRole('button', { name: 'Премахни компонент' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Песто' }),
    ).not.toBeInTheDocument();
    expect(lines('Продукти')).toEqual([
      'пилешко филе · 500 г✓',
      'лук · 2 бр.✓',
      'сол · по вкус✓',
    ]);
    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.components).toEqual([]);
    expect(put[0]?.ingredients.map((line) => line.component)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('нов компонент, затворен без име, изчезва; при 3 компонента „+ Компонент“ го няма', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveEdit({
      ...withPesto,
      components: [
        { name: 'Песто', servings: 5 },
        { name: 'Сос', servings: 2 },
      ],
      ingredients: withPesto.ingredients.map((line, index) => ({
        ...line,
        component: index === 0 ? null : index - 1,
      })),
    });
    await openEdit();

    await user.click(screen.getByRole('button', { name: '+ Компонент' }));
    await user.click(
      sheet('Компонент').getByRole('button', { name: 'Готово' }),
    );
    expect(screen.queryAllByRole('button', { name: /· за/ })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '+ Компонент' }));
    await user.type(
      sheet('Компонент').getByRole('textbox', { name: 'Име' }),
      'Тесто',
    );
    await user.click(
      sheet('Компонент').getByRole('button', { name: 'Готово' }),
    );

    expect(
      screen.getByRole('button', { name: 'Тесто · за 4 порции' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '+ Компонент' }),
    ).not.toBeInTheDocument();
  });
});
