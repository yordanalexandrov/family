import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { logger } from '../../logger';
import {
  createTimerStore,
  type NewTimer,
  remainingMs,
  TIMERS_KEY,
} from './timer-store';

const MINUTE = 60_000;

const fry: NewTimer = {
  recipeId: 'r1',
  recipeTitle: 'Пиле с ориз',
  step: 1,
  label: '15 мин',
  durationMs: 15 * MINUTE,
};

/** Часовникът показва `iso` (само `Date`). */
function atTime(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('таймерите се помнят на устройството', () => {
  it('нов store (презареждане) продължава таймерите с вярното оставащо време', () => {
    atTime('2026-10-31T12:00:00+02:00');
    const started = createTimerStore().start(fry);

    vi.setSystemTime(Date.now() + 4 * MINUTE);
    const timers = createTimerStore().list();

    expect(timers).toEqual([started]);
    expect(timers.map((timer) => remainingMs(timer, Date.now()))).toEqual([
      11 * MINUTE,
    ]);
  });

  it('таймер на пауза остава на пауза със същото оставащо време', () => {
    atTime('2026-10-31T12:00:00+02:00');
    // Паузата е от действията (#257); записът пази целия таймер, с полетата, които store-ът не познава.
    const paused = {
      ...fry,
      id: 't1',
      endsAt: Date.now() + 5 * MINUTE,
      pausedAt: Date.now(),
    };
    localStorage.setItem(
      TIMERS_KEY,
      JSON.stringify({ day: '2026-10-31', timers: [paused] }),
    );

    vi.setSystemTime(Date.now() + 30 * MINUTE);
    const store = createTimerStore();
    expect(store.list()).toEqual([paused]);

    store.start(fry);
    expect(createTimerStore().list()[0]).toEqual(paused);
  });

  it('запис от предишен ден не важи', () => {
    atTime('2026-10-30T23:50:00+02:00');
    createTimerStore().start(fry);

    vi.setSystemTime(new Date('2026-10-31T00:05:00+02:00'));

    expect(createTimerStore().list()).toEqual([]);
  });

  it.each([
    ['не е JSON', '{'],
    ['без таймери', JSON.stringify({ day: '2026-10-31' })],
    [
      'таймер без край',
      JSON.stringify({
        day: '2026-10-31',
        timers: [{ ...fry, id: 't1' }],
      }),
    ],
  ])('повреден запис (%s) дава празен списък и предупреждение', (_, raw) => {
    atTime('2026-10-31T12:00:00+02:00');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    localStorage.setItem(TIMERS_KEY, raw);

    expect(createTimerStore().list()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('без localStorage таймерите работят, само без памет', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    denyStorage();

    const store = createTimerStore();
    const timer = store.start(fry);

    expect(store.list()).toEqual([timer]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

/** localStorage хвърля за таймерите, както в private режим. */
function denyStorage() {
  for (const method of ['getItem', 'setItem'] as const) {
    const original = Storage.prototype[method] as (
      this: Storage,
      ...args: string[]
    ) => unknown;
    const spy = vi
      .spyOn(Storage.prototype, method)
      .mockImplementation(function (this: Storage, ...args: string[]) {
        if (args[0] === TIMERS_KEY) {
          throw new DOMException('denied', 'SecurityError');
        }
        return original.apply(this, args);
      } as never);
    onTestFinished(() => spy.mockRestore());
  }
}
