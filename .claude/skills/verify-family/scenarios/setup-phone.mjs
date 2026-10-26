// First visit on a phone: device mode „Телефон“, then acting user Дани. The run's browser profile remembers both.
// On a fresh profile the app redirects to „Кой си?“ by itself; on a rerun (a user is already chosen) open it directly.
export default async ({ go, see, tap, step, aria, shot, page }) => {
  await go('/?device=phone');
  const who = page.getByRole('heading', { name: 'Кой си?' });
  if (!(await who.isVisible())) {
    step('acting user already chosen in this run; open /who');
    await go('/who');
  }
  await see(who, '"Кой си?"');
  await aria('who');
  await tap(page.getByRole('button', { name: 'Дани' }), 'Дани');
  await see(
    page.getByRole('navigation', { name: 'Основна навигация' }),
    'bottom nav',
  );
  await see(page.getByRole('region', { name: 'Днес накратко' }), 'dashboard');
  await aria('dashboard');
  await shot('dashboard');
};
