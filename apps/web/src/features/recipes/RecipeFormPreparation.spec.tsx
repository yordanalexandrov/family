import type { Preparation, Recipe, RecipeInput } from '@family/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

/** Редакцията на `recipe`; връща телата на `PUT`-овете. */
function serveEdit(preparation: Preparation = []) {
  const put: RecipeInput[] = [];
  let stored: Recipe = { ...chickenWithRice, preparation };
  server.use(
    http.get(`/api/recipes/${chickenWithRice.id}`, () =>
      HttpResponse.json({ recipe: stored }),
    ),
    http.put(`/api/recipes/${chickenWithRice.id}`, async ({ request }) => {
      const body = (await request.json()) as RecipeInput;
      put.push(body);
      stored = { ...stored, preparation: body.preparation };
      return HttpResponse.json({ recipe: stored });
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

/** Редовете в списъка „Подготовка“ на формата, като текст. */
function preparationLines() {
  return within(screen.getByRole('list', { name: 'Подготовка' }))
    .queryAllByRole('listitem')
    .map((line) => line.textContent);
}

function sheet() {
  return within(screen.getByRole('dialog', { name: 'Подготовка' }));
}

function actionBar() {
  return within(screen.getByRole('group', { name: 'Действия' }));
}

describe('RecipeForm: Подготовка', () => {
  it('добавя фурна и накисване: първо вид, после полетата му; „Запази“ ги праща в реда им', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit();
    await openEdit();

    expect(preparationLines()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Добави подготовка' }));
    // Преди вида няма полета.
    expect(sheet().queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(sheet().getByRole('radio', { name: /Фурна/ }));
    await user.type(sheet().getByRole('textbox', { name: 'Градуси' }), '200');
    await user.click(sheet().getByRole('radio', { name: 'С вентилатор' }));
    await user.selectOptions(
      sheet().getByRole('combobox', { name: 'Скара' }),
      'Средна',
    );
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: 'Добави подготовка' }));
    await user.click(sheet().getByRole('radio', { name: /Накисни/ }));
    await user.type(
      sheet().getByRole('textbox', { name: 'Какво' }),
      'накисни боба',
    );
    await user.selectOptions(
      sheet().getByRole('combobox', { name: 'Колко преди' }),
      'от вечерта',
    );
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    expect(preparationLines()).toEqual([
      '🔥200° · с вентилатор · средна скара',
      '💧накисни боба · от вечерта',
    ]);
    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.preparation).toEqual([
      { kind: 'oven', degrees: 200, fan: 'fan', rack: 'middle' },
      { kind: 'soak', text: 'накисни боба', minutesBefore: 720 },
    ]);
  });

  it('поправя, мести и маха елементи', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit([
      { kind: 'oven', degrees: 180, fan: 'conventional' },
      { kind: 'fridge', text: 'извади пилето', minutesBefore: 30 },
      { kind: 'pan', text: 'намажи тавата' },
    ]);
    await openEdit();

    expect(preparationLines()).toEqual([
      '🔥180° · без вентилатор',
      '🧊извади пилето · 30 мин преди',
      '🥘намажи тавата',
    ]);
    await user.click(
      screen.getByRole('button', { name: /извади пилето · 30 мин преди/ }),
    );
    const text = sheet().getByRole('textbox', { name: 'Какво' });
    await user.clear(text);
    await user.type(text, 'извади пилето и маслото');
    await user.selectOptions(
      sheet().getByRole('combobox', { name: 'Колко преди' }),
      '1 ч преди',
    );
    await user.click(sheet().getByRole('button', { name: 'По-нагоре' }));
    expect(sheet().getByRole('button', { name: 'По-нагоре' })).toBeDisabled();
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: /намажи тавата/ }));
    await user.click(sheet().getByRole('button', { name: 'Премахни' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(preparationLines()).toEqual([
      '🧊извади пилето и маслото · 1 ч преди',
      '🔥180° · без вентилатор',
    ]);
    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.preparation).toEqual([
      { kind: 'fridge', text: 'извади пилето и маслото', minutesBefore: 60 },
      { kind: 'oven', degrees: 180, fan: 'conventional' },
    ]);
  });

  it('смяната на вида сменя полетата; втора фурна не може да се избере', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit([{ kind: 'oven', degrees: 200, fan: 'fan' }]);
    await openEdit();

    await user.click(screen.getByRole('button', { name: 'Добави подготовка' }));
    expect(sheet().getByRole('radio', { name: /Фурна/ })).toBeDisabled();
    await user.click(sheet().getByRole('radio', { name: /Почивка/ }));
    expect(sheet().getByRole('textbox', { name: 'Какво' })).toBeInTheDocument();
    expect(
      sheet().queryByRole('textbox', { name: 'Градуси' }),
    ).not.toBeInTheDocument();
    await user.type(
      sheet().getByRole('textbox', { name: 'Какво' }),
      'тестото да втаса',
    );
    // Друг вид без фурна пази текста.
    await user.click(sheet().getByRole('radio', { name: /Друго/ }));
    expect(sheet().getByRole('textbox', { name: 'Какво' })).toHaveValue(
      'тестото да втаса',
    );
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    // Самата фурна може да смени вида си.
    await user.click(screen.getByRole('button', { name: /200°/ }));
    expect(sheet().getByRole('radio', { name: /Фурна/ })).toBeChecked();
    expect(sheet().getByRole('textbox', { name: 'Градуси' })).toHaveValue(
      '200',
    );
    expect(sheet().queryByRole('textbox', { name: 'Какво' })).toBeNull();
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    await user.click(actionBar().getByRole('button', { name: 'Запази' }));
    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]?.preparation).toEqual([
      { kind: 'oven', degrees: 200, fan: 'fan' },
      { kind: 'other', text: 'тестото да втаса' },
    ]);
  });

  it('грешни градуси и празен текст не се пращат и се виждат на реда и в листа', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const put = serveEdit([
      { kind: 'oven', degrees: 200, fan: 'fan' },
      { kind: 'soak', text: 'накисни боба' },
    ]);
    await openEdit();

    await user.click(screen.getByRole('button', { name: /200°/ }));
    const degrees = sheet().getByRole('textbox', { name: 'Градуси' });
    await user.clear(degrees);
    await user.type(degrees, '400');
    await user.click(sheet().getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: /накисни боба/ }));
    await user.clear(sheet().getByRole('textbox', { name: 'Какво' }));
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    await user.click(actionBar().getByRole('button', { name: 'Запази' }));

    expect(
      await screen.findByText('Градусите са цяло число от 30 до 300'),
    ).toBeInTheDocument();
    expect(screen.getByText('Напиши какво да се направи')).toBeInTheDocument();
    expect(put).toEqual([]);

    await user.click(screen.getByRole('button', { name: /400°/ }));
    expect(
      sheet().getByRole('textbox', { name: 'Градуси' }),
    ).toHaveAccessibleDescription('Градусите са цяло число от 30 до 300');
  });

  it('нов елемент, затворен без вид, не остава в списъка', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveEdit();
    await openEdit();

    await user.click(screen.getByRole('button', { name: 'Добави подготовка' }));
    await user.click(sheet().getByRole('button', { name: 'Готово' }));

    expect(preparationLines()).toEqual([]);
  });
});
