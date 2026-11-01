import type { Recipe } from '@family/shared';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../logger';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import { fakeRecognition } from '../../test/speech';

const MINUTE = 60_000;

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Пържи 15 мин до златисто, после задуши 10–15 мин.' },
  ],
};

/**
 * Подменен аудио слой: Web Audio на браузъра (ръбът), който брои пуснатите тонове. Контекстът е „спрян“, докато не
 * се извика `resume` — както в браузъра без докосване.
 */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  /** Колко тона са пуснати, докато контекстът е работел (тихото отключване не се брои). */
  tones = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  createGain() {
    const param = {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    return { gain: param, connect: vi.fn() };
  }

  createOscillator() {
    const context = this;
    return {
      type: 'sine',
      frequency: { value: 440, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start() {
        if (context.state === 'running') {
          context.tones += 1;
        }
      },
      stop: vi.fn(),
    };
  }
}

function tones(): number {
  return FakeAudioContext.instances.reduce(
    (sum, context) => sum + context.tones,
    0,
  );
}

function serveRecipes(...recipes: Recipe[]) {
  server.use(
    ...recipes.map((recipe) =>
      http.get(`/api/recipes/${recipe.id}`, () =>
        HttpResponse.json({ recipe }),
      ),
    ),
  );
}

/**
 * Фалшив часовник, който не спира userEvent и findBy. Почва по обед: изтекъл таймер изчезва в полунощ (София), а
 * тестовете превъртат до часове напред — пуснати късно вечер, не бива да минат през нея.
 */
function fakeClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-30T12:00:00+02:00'));
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

/** Готвене на `stew`, стъпка 2 (с „15 мин“ и „10–15 мин“). */
async function cookStew(mode: 'kiosk' | 'phone' = 'kiosk') {
  const user = fakeClock();
  setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
  serveRecipes(stew);
  renderApp(`/recipes/${stew.id}/cook`);
  await user.click(await screen.findByRole('button', { name: 'Напред' }));
  return user;
}

function banners() {
  return screen.queryAllByRole('alert');
}

let vibrate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: vibrate,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('Сигнал при изтичане на таймер', () => {
  it.each(['kiosk', 'phone'] as const)(
    'при изтичане се появява банер и звучи повтарящ се тон (%s)',
    async (mode) => {
      const user = await cookStew(mode);
      await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));

      act(() => vi.advanceTimersByTime(15 * MINUTE - 1000));
      expect(banners()).toHaveLength(0);
      expect(tones()).toBe(0);

      act(() => vi.advanceTimersByTime(1000));
      const [banner] = banners();
      expect(banner).toHaveTextContent('Стъпка 2 · 15 мин — времето изтече');
      const first = tones();
      expect(first).toBeGreaterThan(0);

      act(() => vi.advanceTimersByTime(10_000));
      expect(tones()).toBeGreaterThan(first);
    },
  );

  it('звукът спира сам след 2 минути, а банерът остава', async () => {
    const user = await cookStew();
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(15 * MINUTE));
    act(() => vi.advanceTimersByTime(2 * MINUTE));
    const after = tones();
    act(() => vi.advanceTimersByTime(MINUTE));

    expect(after).toBeGreaterThan(0);
    expect(tones()).toBe(after);
    expect(banners()).toHaveLength(1);
  });

  /** Таймерът „15 мин“ е изтекъл и звъни. */
  async function ringing() {
    const user = await cookStew();
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(15 * MINUTE));
    const [banner] = banners();
    if (!banner) {
      throw new Error('няма банер');
    }
    return { user, banner };
  }

  /** Звучи ли още: пуснати нови тонове през следващите 5 s. */
  function soundsOn(): boolean {
    const before = tones();
    act(() => vi.advanceTimersByTime(5000));
    return tones() > before;
  }

  it('„Спри“ спира звука и маха банера и таймера', async () => {
    const { user, banner } = await ringing();
    expect(soundsOn()).toBe(true);

    await user.click(within(banner).getByRole('button', { name: 'Спри' }));

    expect(banners()).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Таймери' })).toBeNull();
    expect(soundsOn()).toBe(false);
  });

  it('„+1 мин“ продължава същия таймер с минута и спира звука до новото изтичане', async () => {
    const { user, banner } = await ringing();

    await user.click(within(banner).getByRole('button', { name: '+1 мин' }));

    expect(banners()).toHaveLength(0);
    const strip = screen.getByRole('region', { name: 'Таймери' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(1);
    expect(strip).toHaveTextContent('Стъпка 2 · 15 мин');
    expect(strip).toHaveTextContent('1:00');
    expect(soundsOn()).toBe(false);

    act(() => vi.advanceTimersByTime(MINUTE));
    expect(banners()).toHaveLength(1);
    expect(soundsOn()).toBe(true);
  });

  it('„Повтори“ пуска същото време отначало и спира звука', async () => {
    const { user, banner } = await ringing();

    await user.click(within(banner).getByRole('button', { name: 'Повтори' }));

    expect(banners()).toHaveLength(0);
    const strip = screen.getByRole('region', { name: 'Таймери' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(1);
    expect(strip).toHaveTextContent('15:00');
    expect(soundsOn()).toBe(false);
  });

  it('гласовата команда „спри“ заглушава звъненето, банерът остава, а новото изтичане звъни', async () => {
    const recognition = fakeRecognition();
    const { user, banner } = await ringing();
    await user.click(screen.getByRole('button', { name: 'Слушай' }));
    expect(soundsOn()).toBe(true);

    recognition.say('Спри!');

    expect(soundsOn()).toBe(false);
    expect(banners()).toHaveLength(1);
    expect(banner).toHaveTextContent('Стъпка 2 · 15 мин');

    await user.click(within(banner).getByRole('button', { name: '+1 мин' }));
    act(() => vi.advanceTimersByTime(MINUTE));
    expect(banners()).toHaveLength(1);
    expect(soundsOn()).toBe(true);
  });

  it('заглушеният с „спри“ таймер не звъни пак след презареждане', async () => {
    const recognition = fakeRecognition();
    const { user } = await ringing();
    await user.click(screen.getByRole('button', { name: 'Слушай' }));
    recognition.say('спри');
    expect(soundsOn()).toBe(false);

    cleanup();
    FakeAudioContext.instances = [];
    renderApp(`/recipes/${stew.id}/cook`);
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(soundsOn()).toBe(false);
  });

  it('интервалът звъни на долната граница с „Провери — още до N мин“', async () => {
    const user = await cookStew();
    await user.click(screen.getByRole('button', { name: 'Таймер 10–15 мин' }));

    act(() => vi.advanceTimersByTime(10 * MINUTE));

    const [banner] = banners();
    expect(banner).toHaveTextContent('Стъпка 2 · 10–15 мин');
    expect(banner).toHaveTextContent('Провери — още до 5 мин');
    expect(banner).not.toHaveTextContent('времето изтече');
  });

  it('няколко изтекли таймера дават банери един под друг', async () => {
    const user = await cookStew();
    await user.click(screen.getByRole('button', { name: 'Таймер 10–15 мин' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));

    act(() => vi.advanceTimersByTime(10 * MINUTE));
    expect(banners()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(5 * MINUTE));

    const [simmer, fry] = banners();
    expect(simmer).toHaveTextContent('Стъпка 2 · 10–15 мин');
    expect(fry).toHaveTextContent('Стъпка 2 · 15 мин — времето изтече');

    await user.click(
      within(simmer as HTMLElement).getByRole('button', { name: 'Спри' }),
    );
    expect(banners()).toHaveLength(1);
    expect(banners()[0]).toHaveTextContent('Стъпка 2 · 15 мин');
  });

  it('телефонът вибрира при изтичане', async () => {
    const user = await cookStew('phone');
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(15 * MINUTE - 1000));
    expect(vibrate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    expect(vibrate).toHaveBeenCalled();
  });

  it('без вибрация и без Web Audio таймерът звъни само с банер и предупреждение в лога', async () => {
    vi.stubGlobal('AudioContext', undefined);
    Reflect.deleteProperty(navigator, 'vibrate');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const user = await cookStew();
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));

    act(() => vi.advanceTimersByTime(15 * MINUTE));

    expect(banners()).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Web Audio'),
      expect.anything(),
    );
  });

  it('след презареждане изтеклият таймер звъни, щом звукът се отключи с докосване', async () => {
    const user = await cookStew();
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));

    // Готвене се затваря и се отваря след изтичането, в нов прозорец без докосване: звукът е заключен.
    cleanup();
    FakeAudioContext.instances = [];
    act(() => vi.advanceTimersByTime(20 * MINUTE));
    renderApp(`/recipes/${stew.id}/cook`);

    const [banner] = await screen.findAllByRole('alert');
    expect(banner).toHaveTextContent('Стъпка 2 · 15 мин — изтече преди 5 мин');
    expect(soundsOn()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(soundsOn()).toBe(true);

    // Звъни 2 минути от отварянето.
    act(() => vi.advanceTimersByTime(2 * MINUTE));
    expect(soundsOn()).toBe(false);
    expect(banners()).toHaveLength(1);
  });

  it('ръчният таймер също звъни: „Пусни“ отключва звука', async () => {
    const user = await cookStew('phone');
    await user.click(screen.getByRole('button', { name: 'Таймер' }));
    const sheet = screen.getByRole('dialog', { name: 'Таймер' });
    await user.click(within(sheet).getByRole('button', { name: '+5 мин' }));
    await user.click(within(sheet).getByRole('button', { name: 'Пусни' }));

    act(() => vi.advanceTimersByTime(5 * MINUTE));

    expect(banners()[0]).toHaveTextContent(
      'Таймер · Стъпка 2 — времето изтече',
    );
    expect(soundsOn()).toBe(true);
  });
});
