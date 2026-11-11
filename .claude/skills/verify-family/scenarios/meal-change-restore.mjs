// Feature menu (`meal-changed`, `meal-restored`, #371): on the phone, Дани puts the older „Леща verify …“ recipe on
// next week's Monday, Поли votes „за“, Дани changes it to the newer one („✓ Сменено (беше „…“)“, Поли's vote gone)
// and „Върни“ brings back the recipe and both votes, checked in `meal` and `meal_vote`.
// Needs setup-phone.mjs and recipe-create.mjs twice first in the same run. Takes next week's plan if there is one
// (after menu-to-shopping.mjs), else starts it empty.
const POLI = '22222222-2222-4222-8222-222222222222';
const NEXT_WEEK = "date_trunc('week', now() + interval '7 days')::date";

export default async ({ go, see, tap, step, aria, shot, psql, api, page }) => {
  const titles = psql(
    "select title from recipe where title like 'Леща verify %' order by created_at",
  )
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Леща'));
  if (titles.length < 2) {
    throw new Error(
      'needs two „Леща verify …“ recipes: run recipe-create.mjs twice',
    );
  }
  const [a, b] = titles.slice(-2);
  const dinners = page.getByRole('list', { name: 'Вечери' });
  const sheet = page.getByRole('dialog');
  const status = sheet.getByRole('status');
  const monday = `select m.id from meal m join meal_plan p on p.id = m.plan_id where p.week_start = ${NEXT_WEEK} order by m.date limit 1`;
  // Monday's recipe and votes as „title | Дани:up,Поли:up“.
  const mealRow = () =>
    psql(
      "select r.title, (select string_agg(case when v.user_id::text like '1111%' then 'Дани' else 'Поли' end || ':' || v.value, ',' order by v.user_id) from meal_vote v where v.meal_id = m.id) as votes " +
        `from meal m left join recipe r on r.id = m.recipe_id where m.id = (${monday})`,
    );

  async function pick(title) {
    const change = sheet.getByRole('button', { name: '↻ Смени ястието' });
    if (await change.count()) {
      await tap(change, '↻ Смени ястието');
    }
    await tap(
      sheet.getByRole('button', { name: 'Избери от рецептите' }),
      'Избери от рецептите',
    );
    await sheet.getByRole('searchbox', { name: 'Търси рецепта' }).fill(title);
    await tap(
      sheet
        .getByRole('list', { name: 'Вечерни рецепти' })
        .getByRole('button', { name: title }),
      title,
    );
    await see(
      sheet.getByRole('link', { name: title }),
      `overview with ${title}`,
    );
  }

  async function openMonday() {
    await go('/menu');
    await tap(
      page.getByRole('tab', { name: 'Следваща седмица' }),
      'Следваща седмица',
    );
    const start = page.getByRole('button', { name: 'Започни празно' });
    await dinners.or(start).first().waitFor();
    if (await start.count()) {
      await tap(start, 'Започни празно');
    }
    await tap(dinners.getByRole('button').first(), 'Monday row');
  }

  step(`Monday → ${a}`);
  await openMonday();
  await pick(a);
  await see(status.getByText(/✓ Сменено/), '✓ Сменено');
  await tap(sheet.getByRole('button', { name: 'Готово' }), 'Готово');

  step('Поли votes „за“ through the api');
  const mealId = psql(monday).split('\n')[2].trim();
  const vote = await api(`/api/menu/meals/${mealId}/vote`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-acting-user': POLI },
    body: JSON.stringify({ value: 'up' }),
  });
  if (!vote?.meal) {
    throw new Error(`Поли's vote: ${JSON.stringify(vote)}`);
  }
  const before = mealRow();
  if (!before.includes(a) || !/Дани:up,Поли:up/.test(before)) {
    throw new Error(`before the change:\n${before}`);
  }

  step(`Monday ${a} → ${b}`);
  await openMonday();
  await see(sheet.getByRole('group', { name: 'Гласове' }), 'Гласове');
  await aria('meal-before');
  await shot('meal-before');
  await pick(b);
  await see(status.getByText(`✓ Сменено (беше „${a}“)`), '✓ Сменено (беше …)');
  await see(status.getByRole('button', { name: 'Върни' }), 'Върни');
  await aria('meal-changed');
  await shot('meal-changed');
  const changed = mealRow();
  if (!changed.includes(b) || changed.includes('Поли:up')) {
    throw new Error(`after the change:\n${changed}`);
  }

  step('Върни');
  await tap(status.getByRole('button', { name: 'Върни' }), 'Върни');
  await see(sheet.getByRole('link', { name: a }), `back to ${a}`);
  await see(
    sheet.getByRole('group', { name: 'Гласове' }).getByText(/Поли: за/),
    'Поли: за back',
  );
  if ((await status.textContent()) !== '') {
    throw new Error('„✓ Сменено“ still shown after „Върни“');
  }
  await aria('meal-restored');
  await shot('meal-restored');
  const restored = mealRow();
  if (restored !== before) {
    throw new Error(
      `restored differs:\nbefore:\n${before}\nafter:\n${restored}`,
    );
  }

  // Second view: a fresh load shows the restored recipe.
  await page.reload({ waitUntil: 'networkidle' });
  await tap(
    page.getByRole('tab', { name: 'Следваща седмица' }),
    'Следваща седмица',
  );
  await see(
    dinners.getByRole('button', { name: new RegExp(a) }).first(),
    `Monday row ${a} after reload`,
  );
};
