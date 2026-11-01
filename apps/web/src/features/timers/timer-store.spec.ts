import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { logger } from '../../logger';
import {
  createTimerStore,
  type NewTimer,
  remainingMs,
  TIMERS_KEY,
  timerLabel,
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
  it('таймер на пауза остава на пауза със същото оставащо време', () => {
    atTime('2026-10-31T12:00:00+02:00');
    // Паузата е от действията (#257); записът пази целия таймер, с полетата, които store-ът не познава.
    const paused = {
      ...fry,
      id: 't1',
      endsAt: Date.now() + 5 * MINUTE,
      pausedAt: Date.now(),
    };
    localStorage.setItem(TIMERS_KEY, JSON.stringify([paused]));

    vi.setSystemTime(Date.now() + 30 * MINUTE);
    const store = createTimerStore();
    expect(store.list()).toEqual([paused]);

    store.start(fry);
    expect(createTimerStore().list()[0]).toEqual(paused);
  });

  it('таймер от отговор на въпрос остава „Въпрос · …“ и в следващото Готвене', () => {
    atTime('2026-10-31T12:00:00+02:00');
    createTimerStore().start({ ...fry, label: '10 мин', question: true });

    const [timer] = createTimerStore().list();
    expect(timer && timerLabel(timer, fry.recipeId)).toBe('Въпрос · 10 мин');
  });

  it('след полунощ изтеклите от предишния ден изчезват, а работещите и на пауза остават', () => {
    atTime('2026-10-30T23:30:00+02:00');
    createTimerStore().start(fry);
    vi.setSystemTime(new Date('2026-10-30T23:50:00+02:00'));
    const store = createTimerStore();
    store.start({ ...fry, label: '30 мин', durationMs: 30 * MINUTE });
    const paused = store.start({
      ...fry,
      label: '1 ч',
      durationMs: 60 * MINUTE,
    });
    store.pause(paused.id);

    vi.setSystemTime(new Date('2026-10-31T00:05:00+02:00'));

    expect(
      createTimerStore()
        .list()
        .map((timer) => timer.label),
    ).toEqual(['30 мин', '1 ч']);
  });

  it.each([
    ['не е JSON', '{'],
    ['не е списък', JSON.stringify({ timers: [] })],
    ['таймер без край', JSON.stringify([{ ...fry, id: 't1' }])],
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

// Действията се виждат през екрана (timers.spec.tsx, alarm.spec.tsx); тук остават случаите без бутон за тях.
describe('действия с пуснат таймер', () => {
  it('„+1 мин“ на пауза добавя минута, без да пуска броенето', () => {
    atTime('2026-10-31T12:00:00+02:00');
    const store = createTimerStore();
    const { id } = store.start(fry);
    vi.setSystemTime(Date.now() + 5 * MINUTE);
    store.pause(id);

    store.addMinute(id);
    vi.setSystemTime(Date.now() + 3 * MINUTE);

    const [timer] = store.list();
    expect(timer && remainingMs(timer, Date.now())).toBe(11 * MINUTE);
  });

  it('действие уведомява абонатите, а непознат таймер не променя нищо', () => {
    const store = createTimerStore();
    const { id } = store.start(fry);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    onTestFinished(unsubscribe);
    const before = store.list();

    store.addMinute('няма-такъв');
    expect(store.list()).toBe(before);
    expect(calls).toBe(0);

    store.addMinute(id);
    expect(calls).toBe(1);
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
