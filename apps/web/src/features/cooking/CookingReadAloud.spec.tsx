import type { Recipe } from '@family/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import { bulgarianVoice, englishVoice, fakeSpeech } from '../../test/speech';

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Задуши с лука 15 мин.' },
    { text: 'Посоли и сервирай.' },
  ],
};

async function openCooking(mode: 'kiosk' | 'phone' | 'browser' = 'phone') {
  setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
  server.use(
    http.get(`/api/recipes/${stew.id}`, () =>
      HttpResponse.json({ recipe: stew }),
    ),
  );
  const rendered = renderApp(`/recipes/${stew.id}/cook`);
  await screen.findByText(/^Стъпка \d от 3$/);
  return rendered;
}

describe('Четене на глас в Готвене', () => {
  it.each(['kiosk', 'phone', 'browser'] as const)(
    '🔊 чете текущата стъпка с български глас, а съкращенията — разгънати (%s)',
    async (mode) => {
      const user = userEvent.setup();
      const speech = fakeSpeech();
      await openCooking(mode);
      await user.click(screen.getByRole('button', { name: 'Напред' }));

      await user.click(
        screen.getByRole('button', { name: 'Прочети стъпката' }),
      );

      expect(speech.spoken).toEqual([
        { text: 'Стъпка 2. Задуши с лука 15 минути.', voice: 'bg-BG' },
      ]);
    },
  );

  it('гласовете, заредени след влизането (`voiceschanged`), показват 🔊', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech({ voices: [] });
    await openCooking();
    expect(
      screen.queryByRole('button', { name: 'Прочети стъпката' }),
    ).not.toBeInTheDocument();

    speech.loadVoices([englishVoice, bulgarianVoice]);
    await user.click(
      await screen.findByRole('button', { name: 'Прочети стъпката' }),
    );

    expect(speech.spoken).toEqual([
      { text: 'Стъпка 1. Нарежи пилето.', voice: 'bg-BG' },
    ]);
  });

  it('без български глас 🔊 и „Чети стъпките“ ги няма', async () => {
    fakeSpeech({ voices: [englishVoice] });
    await openCooking();

    expect(
      screen.queryByRole('button', { name: 'Прочети стъпката' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Чети стъпките' }),
    ).not.toBeInTheDocument();
  });

  it('без `speechSynthesis` 🔊 и „Чети стъпките“ ги няма', async () => {
    await openCooking();

    expect(screen.getByRole('button', { name: 'По-едър текст' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Прочети стъпката' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Чети стъпките' }),
    ).not.toBeInTheDocument();
  });

  it('„Чети стъпките“ чете всяка нова стъпка сама и се помни на устройството', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech();
    const first = await openCooking();
    const toggle = screen.getByRole('button', { name: 'Чети стъпките' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(speech.spoken).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Напред' }));
    speech.finish();
    await user.click(screen.getByRole('button', { name: 'Стъпка 3' }));
    expect(speech.spoken.map(({ text }) => text)).toEqual([
      'Стъпка 2. Задуши с лука 15 минути.',
      'Стъпка 3. Посоли и сервирай.',
    ]);

    first.unmount();
    await openCooking();
    expect(
      screen.getByRole('button', { name: 'Чети стъпките' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(speech.speaking()).toBe('Стъпка 2. Задуши с лука 15 минути.');
  });

  it('изключеното „Чети стъпките“ не чете при смяна на стъпката', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech();
    await openCooking();

    await user.click(screen.getByRole('button', { name: 'Напред' }));

    expect(speech.spoken).toEqual([]);
  });

  it('нова стъпка прекъсва четенето, а при „Чети стъпките“ чете нея', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech();
    await openCooking();
    await user.click(screen.getByRole('button', { name: 'Прочети стъпката' }));
    expect(speech.speaking()).toBe('Стъпка 1. Нарежи пилето.');

    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(speech.speaking()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Чети стъпките' }));
    await user.click(screen.getByRole('button', { name: 'Прочети стъпката' }));
    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(speech.speaking()).toBe('Стъпка 3. Посоли и сервирай.');
    expect(speech.spoken.map(({ text }) => text)).toEqual([
      'Стъпка 1. Нарежи пилето.',
      'Стъпка 2. Задуши с лука 15 минути.',
      'Стъпка 3. Посоли и сервирай.',
    ]);
  });

  it.each(['Затвори', 'Готово'])(
    'излизането от Готвене („%s“) спира четенето',
    async (exit) => {
      const user = userEvent.setup();
      const speech = fakeSpeech();
      await openCooking();
      await user.click(screen.getByRole('button', { name: 'Стъпка 3' }));
      await user.click(
        screen.getByRole('button', { name: 'Прочети стъпката' }),
      );
      expect(speech.speaking()).toBe('Стъпка 3. Посоли и сервирай.');

      await user.click(screen.getByRole('button', { name: exit }));

      await screen.findByRole('link', { name: 'Готви' });
      expect(speech.speaking()).toBeNull();
    },
  );
});
