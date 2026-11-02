import type { Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, dani, server } from '../../test/msw';
import { chickenWithRice, serveRating } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

function serveRecipe(recipe: Recipe = chickenWithRice) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
  );
}

describe('RecipeView', () => {
  it('показва продуктите по щандове с количество и единица, и номерираните стъпки', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe();

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4 порции')).toBeInTheDocument();
    expect(screen.getByText('45 мин')).toBeInTheDocument();

    const meat = screen.getByRole('list', { name: 'Месо и колбаси' });
    expect(within(meat).getByRole('listitem')).toHaveTextContent(
      'пилешко филе500 г',
    );
    expect(
      within(screen.getByRole('list', { name: 'Плод и зеленчук' })).getByRole(
        'listitem',
      ),
    ).toHaveTextContent('лук2 бр.');
    expect(
      within(
        screen.getByRole('list', { name: 'Подправки, сосове и бакалия' }),
      ).getByRole('listitem'),
    ).toHaveTextContent('солпо вкус');

    const steps = within(
      screen.getByRole('list', { name: 'Стъпки' }),
    ).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Нарежи пилето.',
      'Задуши с лука.',
    ]);

    expect(screen.getByRole('link', { name: 'Източник' })).toHaveAttribute(
      'href',
      'https://recepti.example/pile-s-oriz',
    );
    expect(
      screen.getByText(/≈ хранителна стойност на 100 г/),
    ).toHaveTextContent('150 kcal');
    expect(screen.getByRole('link', { name: 'Редактирай' })).toHaveAttribute(
      'href',
      `/recipes/${chickenWithRice.id}/edit`,
    );
  });

  it('показва подготовката над продуктите, с иконите на видовете и надписите', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe({
      ...chickenWithRice,
      preparation: [
        { kind: 'oven', degrees: 200, fan: 'fan', rack: 'middle' },
        { kind: 'soak', text: 'накисни боба', minutesBefore: 720 },
        { kind: 'fridge', text: 'извади пилето', minutesBefore: 30 },
      ],
    });

    renderApp(`/recipes/${chickenWithRice.id}`);

    const heading = await screen.findByRole('heading', { name: 'Подготовка' });
    const items = within(
      screen.getByRole('list', { name: 'Подготовка' }),
    ).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '🔥200° · с вентилатор · средна скара',
      '💧накисни боба · от вечерта',
      '🧊извади пилето · 30 мин преди',
    ]);
    expect(
      within(items[0] as HTMLElement).getByRole('img', { name: 'Фурна' }),
    ).toBeInTheDocument();
    // Разделът е над продуктите.
    const products = screen.getByRole('heading', { name: 'Продукти' });
    expect(
      heading.compareDocumentPosition(products) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('рецепта без подготовка няма раздел „Подготовка“', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe();

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(
      await screen.findByRole('heading', { name: 'Продукти' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Подготовка' }),
    ).not.toBeInTheDocument();
  });

  it('стъпка със снимка има миниатюра, която се отваря на цял екран', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const photoId = 'eeeeeeee-1111-4000-8000-000000000001';
    serveRecipe({
      ...chickenWithRice,
      steps: [{ text: 'Нарежи пилето.' }, { text: 'Задуши с лука.', photoId }],
    });

    renderApp(`/recipes/${chickenWithRice.id}`);

    const steps = within(
      await screen.findByRole('list', { name: 'Стъпки' }),
    ).getAllByRole('listitem');
    expect(within(steps[0] as HTMLElement).queryByRole('img')).toBeNull();
    const thumbnail = within(steps[1] as HTMLElement).getByRole('img', {
      name: 'Снимката на стъпка 2',
    });
    expect(thumbnail.getAttribute('src')).toMatch(
      new RegExp(`^/api/step-photos/${photoId}\\?w=\\d+$`),
    );

    await user.click(
      screen.getByRole('button', { name: 'Снимката на стъпка 2 на цял екран' }),
    );
    const viewer = screen.getByRole('dialog', { name: 'Снимката на стъпка 2' });
    expect(within(viewer).getByRole('img')).toHaveAttribute(
      'src',
      `/api/step-photos/${photoId}`,
    );

    await user.click(within(viewer).getByRole('button', { name: 'Затвори' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('на TV стъпките са без снимки', async () => {
    setUpDevice('tv');
    serveRecipe({
      ...chickenWithRice,
      steps: [
        {
          text: 'Нарежи пилето.',
          photoId: 'eeeeeeee-1111-4000-8000-000000000001',
        },
      ],
    });

    renderApp(`/recipes/${chickenWithRice.id}`);

    const steps = await screen.findByRole('list', { name: 'Стъпки' });
    expect(steps).toHaveTextContent('Нарежи пилето.');
    expect(within(steps).queryByRole('img')).toBeNull();
  });

  it('рецепта за наш уред показва значка с краткото му име', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe({ ...chickenWithRice, appliance: 'sous vide' });

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(await screen.findByText('🔌 sous vide')).toBeInTheDocument();
  });

  it('рецепта без уред няма значка', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe();

    renderApp(`/recipes/${chickenWithRice.id}`);

    await screen.findByRole('heading', { name: 'Пиле с ориз' });
    expect(screen.queryByText(/🔌/)).not.toBeInTheDocument();
  });

  it('дълго време се чете в часове: 225 мин са „3 ч 45 мин“', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe({ ...chickenWithRice, prepMinutes: 225 });

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(await screen.findByText('3 ч 45 мин')).toBeInTheDocument();
  });

  it('„Архивирай“ праща заявката и предлага „Върни“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();
    let archived = false;
    server.use(
      http.post(`/api/recipes/${chickenWithRice.id}/archive`, () => {
        archived = true;
        return HttpResponse.json({
          recipe: {
            ...chickenWithRice,
            archivedAt: '2026-10-25T10:00:00.000Z',
          },
        });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}`);
    await user.click(await screen.findByRole('button', { name: 'Архивирай' }));

    expect(
      await screen.findByRole('button', { name: 'Върни' }),
    ).toBeInTheDocument();
    expect(archived).toBe(true);
    expect(screen.getByText('Архивирана')).toBeInTheDocument();
  });

  it('звездите под заглавието поставят оценката, а натискане на същата звезда я маха', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();
    const calls = serveRating();

    renderApp(`/recipes/${chickenWithRice.id}`);
    const stars = await screen.findByRole('group', { name: 'Оценка' });
    expect(stars).toHaveAccessibleDescription('Неоценена');

    await user.click(within(stars).getByRole('button', { name: '4 от 5' }));

    expect(
      within(stars).getByRole('button', { name: '4 от 5' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => calls)
      .toEqual([{ id: chickenWithRice.id, rating: 4 }]);

    await user.click(within(stars).getByRole('button', { name: '2 от 5' }));
    await user.click(within(stars).getByRole('button', { name: '2 от 5' }));

    await expect.poll(() => calls.length).toBe(3);
    expect(calls.at(-1)).toEqual({ id: chickenWithRice.id, rating: null });
    expect(stars).toHaveAccessibleDescription('Неоценена');
    for (const star of within(stars).getAllByRole('button')) {
      expect(star).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('при грешка оценката се връща', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe({ ...chickenWithRice, rating: 3 });
    server.use(
      http.put('/api/recipes/:id/rating', () =>
        apiError(404, 'not_found', 'Няма такава рецепта'),
      ),
    );

    renderApp(`/recipes/${chickenWithRice.id}`);
    const stars = await screen.findByRole('group', { name: 'Оценка' });
    await user.click(within(stars).getByRole('button', { name: '5 от 5' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Няма такава рецепта',
    );
    expect(
      within(stars).getByRole('button', { name: '3 от 5' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['kiosk', 'tv'] as const)(
    'на %s без избран потребител рецептата няма бутони за писане, а оценката е само за четене',
    async (mode) => {
      setUpDevice(mode);
      serveRecipe({ ...chickenWithRice, rating: 4 });

      renderApp(`/recipes/${chickenWithRice.id}`);

      expect(
        await screen.findByRole('heading', { name: 'Пиле с ориз' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Оценка 4 от 5' })).toBeVisible();
      expect(screen.queryByRole('group', { name: 'Оценка' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Редактирай' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Архивирай' })).toBeNull();
      // „Как мина?“ работи и без действащ потребител, но не на TV.
      expect(
        screen.queryAllByRole('button').map((button) => button.textContent),
      ).toEqual(mode === 'kiosk' ? ['Как мина?'] : []);
    },
  );

  it.each(['phone', 'kiosk'] as const)(
    'на %s „Как мина?“ отваря листа с текущата оценка, а „Пропусни“ го затваря',
    async (mode) => {
      const user = userEvent.setup();
      setUpDevice(mode, mode === 'phone' ? dani.id : undefined);
      serveRecipe({ ...chickenWithRice, rating: 4 });

      const { router } = renderApp(`/recipes/${chickenWithRice.id}`);
      await user.click(
        await screen.findByRole('button', { name: 'Как мина?' }),
      );
      const sheet = await screen.findByRole('dialog', { name: 'Как мина?' });
      expect(
        within(within(sheet).getByRole('group', { name: 'Оценка' })).getByRole(
          'button',
          { name: '4 от 5' },
        ),
      ).toHaveAttribute('aria-pressed', 'true');

      await user.click(within(sheet).getByRole('button', { name: 'Пропусни' }));

      expect(screen.queryByRole('dialog', { name: 'Как мина?' })).toBeNull();
      expect(router.state.location.pathname).toBe(
        `/recipes/${chickenWithRice.id}`,
      );
    },
  );

  it('kiosk не предлага писане и когато телефонът е оставил потребител в паметта', async () => {
    setUpDevice('kiosk', dani.id);
    serveRecipe();

    renderApp(`/recipes/${chickenWithRice.id}`);

    await screen.findByRole('heading', { name: 'Пиле с ориз' });
    expect(screen.queryByRole('group', { name: 'Оценка' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Редактирай' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Архивирай' })).toBeNull();
  });

  it('с избран потребител рецептата предлага оценка, „Редактирай“ и „Архивирай“', async () => {
    setUpDevice('phone', dani.id);
    serveRecipe();

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(
      await screen.findByRole('group', { name: 'Оценка' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Редактирай' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Архивирай' })).toBeVisible();
  });

  it('за непозната рецепта показва съобщението от api', async () => {
    setUpDevice('phone', dani.id);
    server.use(
      http.get('/api/recipes/:id', () =>
        apiError(404, 'not_found', 'Няма такава рецепта'),
      ),
    );

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Няма такава рецепта',
    );
  });
});
