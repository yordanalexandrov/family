// Feature recipes → `recipe-create` + `recipe-view`: a dinner recipe with one seed ingredient, saved through the form.
// Needs setup-phone.mjs first in the same run. Title is unique per drive so reruns don't collide.
export default async ({ go, see, tap, step, aria, shot, psql, page }) => {
  const title = `Леща verify ${Date.now().toString(36)}`;
  await go('/recipes');
  await tap(page.getByRole('link', { name: 'Нова рецепта' }), 'Нова рецепта');
  await see(page.getByRole('heading', { name: 'Нова рецепта', level: 1 }));

  step(`fill title "${title}", tag вечеря, лук 2 бр., one step`);
  await page.getByRole('textbox', { name: 'Заглавие' }).fill(title);
  await tap(
    page
      .getByRole('group', { name: 'Тагове' })
      .getByRole('button', { name: 'вечеря' }),
    'tag вечеря',
  );
  await tap(
    page.getByRole('button', { name: 'Добави продукт' }),
    'Добави продукт',
  );
  // Редът продукт се попълва в лист „Продукт“ и във формата остава един ред текст.
  const sheet = page.getByRole('dialog', { name: 'Продукт' });
  await sheet.getByRole('textbox', { name: 'Продукт' }).fill('лук');
  await tap(
    sheet
      .getByRole('list', { name: 'Съвпадения' })
      .getByRole('button', { name: 'лук', exact: true }),
    'match лук',
  );
  await sheet.getByRole('textbox', { name: 'Количество' }).fill('2');
  await sheet.getByRole('combobox', { name: 'Единица' }).selectOption('бр.');
  await tap(sheet.getByRole('button', { name: 'Готово' }), 'Готово');
  await see(
    page.getByRole('button', { name: 'лук · 2 бр.' }),
    'ingredient line лук · 2 бр.',
  );
  // Нова рецепта започва без стъпки; стъпката се попълва в лист „Стъпка“.
  await tap(
    page.getByRole('button', { name: 'Добави стъпка' }),
    'Добави стъпка',
  );
  const stepSheet = page.getByRole('dialog', { name: 'Стъпка' });
  await stepSheet
    .getByRole('textbox', { name: 'Стъпка 1' })
    .fill('Свари лещата с лука.');
  await tap(stepSheet.getByRole('button', { name: 'Готово' }), 'Готово');
  await see(
    page
      .getByRole('list', { name: 'Стъпки' })
      .getByRole('button', { name: 'Свари лещата с лука.' }),
    'step line',
  );
  await aria('form-filled');

  await tap(page.getByRole('button', { name: 'Запази' }), 'Запази');
  await see(
    page.getByRole('heading', { name: title, level: 1 }),
    'recipe view heading',
  );
  await see(
    page
      .getByRole('list', { name: 'Плод и зеленчук' })
      .getByRole('listitem')
      .filter({ hasText: 'лук' })
      .filter({ hasText: '2 бр.' }),
    'ingredient line лук 2 бр.',
  );
  await see(
    page
      .getByRole('region', { name: 'Стъпки' })
      .getByRole('listitem')
      .filter({ hasText: 'Свари лещата с лука.' }),
    'step in view',
  );
  await aria('recipe-view');
  await shot('recipe-view');

  step('back to the list, search the title');
  await tap(page.getByRole('link', { name: '← Рецепти' }));
  await page.getByRole('searchbox', { name: 'Търси' }).fill(title);
  await see(page.getByRole('link', { name: new RegExp(title) }), 'list entry');
  await shot('recipe-list');

  const rows = psql(
    `select r.title, r.servings, r.tags, ri.quantity, ri.unit, i.name from recipe r ` +
      `join recipe_ingredient ri on ri.recipe_id = r.id join ingredient i on i.id = ri.ingredient_id ` +
      `where r.title = '${title}'`,
  );
  if (!rows.includes('(1 row)') || !rows.includes('лук'))
    throw new Error(`recipe not stored as expected:\n${rows}`);
};
