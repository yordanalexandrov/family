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
  const row = page.getByRole('group', { name: 'Продукт 1' });
  await row.getByRole('textbox', { name: 'Продукт' }).fill('лук');
  await tap(
    row
      .getByRole('list', { name: 'Съвпадения' })
      .getByRole('button', { name: 'лук', exact: true }),
    'match лук',
  );
  await row.getByRole('textbox', { name: 'Количество' }).fill('2');
  await row.getByRole('combobox', { name: 'Единица' }).selectOption('бр.');
  await page
    .getByRole('textbox', { name: 'Стъпка 1' })
    .fill('Свари лещата с лука.');
  await aria('form-filled');

  // „Запази“ is under the bottom nav on a 390px phone (known bug), so submit the form with Enter like a keyboard user.
  step('submit with Enter in Заглавие');
  await page.getByRole('textbox', { name: 'Заглавие' }).press('Enter');
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
