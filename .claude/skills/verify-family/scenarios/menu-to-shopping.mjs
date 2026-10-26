// Features menu (`menu-empty`, `menu-meal`) and shopping (`shopping-computed`, `shopping-check`, `shopping-add`):
// next week's empty plan, Monday = the newest „Леща verify …“ recipe cooked by Дани, then its list.
// Needs setup-phone.mjs and recipe-create.mjs first in the same run. Uses next week so it never meets a plan
// another scenario made for this week; a run is disposable, so rerunning in the same run fails at „Започни празно“.
export default async ({ go, see, tap, step, aria, shot, psql, page }) => {
  const title = psql(
    "select title from recipe where title like 'Леща verify %' order by created_at desc limit 1",
  )
    .split('\n')[2]
    ?.trim();
  if (!title)
    throw new Error('no „Леща verify …“ recipe; run recipe-create.mjs first');

  await go('/menu');
  await tap(
    page.getByRole('tab', { name: 'Следваща седмица' }),
    'Следваща седмица',
  );
  await tap(
    page.getByRole('button', { name: 'Започни празно' }),
    'Започни празно',
  );
  const dinners = page.getByRole('list', { name: 'Вечери' });
  await see(
    dinners.getByRole('button', { name: /Избери ястие/ }),
    '7 empty dinners',
  );
  await aria('menu-empty');

  step(`Monday: ${title}, cook Дани`);
  await tap(dinners.getByRole('button').first(), 'Monday row');
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('searchbox', { name: 'Търси рецепта' }).fill(title);
  await tap(
    sheet
      .getByRole('list', { name: 'Вечерни рецепти' })
      .getByRole('button', { name: title }),
    title,
  );
  await tap(
    sheet
      .getByRole('group', { name: 'Готвач' })
      .getByRole('button', { name: 'Дани' }),
    'cook Дани',
  );
  await tap(sheet.getByRole('button', { name: 'Готово' }), 'Готово');
  await see(
    dinners.getByRole('button', {
      name: new RegExp(`${title} Готви Дани 2 порции`),
    }),
    'Monday row updated',
  );
  await aria('menu-filled');
  await shot('menu-filled');

  step('shopping list for next week');
  await tap(
    page
      .getByRole('navigation', { name: 'Основна навигация' })
      .getByRole('link', { name: 'Пазаруване' }),
  );
  await tap(
    page.getByRole('tab', { name: 'Следваща седмица' }),
    'Следваща седмица',
  );
  // Recipe: 4 servings, лук 2 бр. → 2 servings planned → 1 бр.
  const onion = page
    .getByRole('region', { name: 'Плод и зеленчук' })
    .getByRole('listitem')
    .filter({ hasText: 'лук' });
  await see(onion.getByText('1 бр.'), 'лук 1 бр. (scaled 2/4)');
  await see(page.getByText('1 от 1 за купуване'), 'counter 1 от 1');
  await aria('shopping-computed');

  await tap(onion.getByRole('checkbox', { name: 'лук' }), 'check лук');
  await see(page.getByText('0 от 1 за купуване'), 'counter 0 от 1');

  step('add a manual item „кафе“');
  await tap(page.getByRole('button', { name: '+ Добави' }), '+ Добави');
  const add = page.getByRole('dialog', { name: 'Добави' });
  await add.getByRole('textbox', { name: 'Заглавие' }).fill('кафе');
  await add.getByRole('combobox', { name: 'Щанд' }).selectOption('Напитки');
  await tap(add.getByRole('button', { name: 'Добави', exact: true }), 'Добави');
  await add.waitFor({ state: 'hidden' }); // „Добави“ saves and closes the sheet
  await see(
    page
      .getByRole('region', { name: 'Напитки' })
      .getByRole('checkbox', { name: 'кафе' }),
    'кафе under Напитки',
  );
  await aria('shopping-final');
  await shot('shopping-final');

  // Second view: a fresh load shows the same state, and the rows are in the database.
  await page.reload({ waitUntil: 'networkidle' });
  await tap(page.getByRole('tab', { name: 'Следваща седмица' }));
  await see(
    page.getByRole('checkbox', { name: 'лук', checked: true }),
    'лук still checked after reload',
  );
  const rows = psql(
    'select si.kind, coalesce(si.title, i.name) as item, si.aisle, si.checked_by is not null as checked ' +
      'from shopping_item si join shopping_list sl on sl.id = si.list_id join meal_plan mp on mp.id = sl.plan_id ' +
      "left join ingredient i on si.item_key like i.id || ':%' " +
      "where mp.week_start = date_trunc('week', now() + interval '7 days')::date order by 1, 2",
  );
  if (
    !/computed\s*\|\s*лук.*\|\s*t/.test(rows) ||
    !/manual\s*\|\s*кафе/.test(rows)
  ) {
    throw new Error(`shopping rows not as expected:\n${rows}`);
  }
};
