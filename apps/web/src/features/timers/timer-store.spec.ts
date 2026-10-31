import { describe, expect, it } from 'vitest';
import { createTimerStore, remainingMs, type Timer } from './timer-store';

const MINUTE = 60_000;

/** Store с ръчен часовник: `clock.at` е „сега“ в ms. */
function storeWithClock() {
  const clock = { at: 1_000_000 };
  const store = createTimerStore({ now: () => clock.at });
  const timer = store.start({
    recipeId: 'r1',
    recipeTitle: 'Яхния',
    step: 1,
    label: '15 мин',
    durationMs: 15 * MINUTE,
  });
  const left = () => remainingMs(current(), clock.at);
  function current(): Timer {
    const found = store.list().find((t) => t.id === timer.id);
    if (!found) {
      throw new Error('няма таймер');
    }
    return found;
  }
  return { clock, store, id: timer.id, left, current };
}

describe('действия с пуснат таймер', () => {
  it('„+1 мин“ добавя минута към оставащото време', () => {
    const { clock, store, id, left } = storeWithClock();
    clock.at += 5 * MINUTE;

    store.addMinute(id);

    expect(left()).toBe(11 * MINUTE);
  });

  it('„+1 мин“ на изтекъл таймер брои минута от сега', () => {
    const { clock, store, id, left } = storeWithClock();
    clock.at += 20 * MINUTE;

    store.addMinute(id);

    expect(left()).toBe(MINUTE);
  });

  it('пауза спира броенето, а „Продължи“ го пуска от същото оставащо време', () => {
    const { clock, store, id, left, current } = storeWithClock();
    clock.at += 5 * MINUTE;

    store.pause(id);
    clock.at += 30 * MINUTE;
    expect(current().pausedAt).toBeDefined();
    expect(left()).toBe(10 * MINUTE);

    store.resume(id);
    expect(current().pausedAt).toBeUndefined();
    expect(left()).toBe(10 * MINUTE);
    clock.at += 4 * MINUTE;
    expect(left()).toBe(6 * MINUTE);
  });

  it('„+1 мин“ на пауза добавя минута, без да пуска броенето', () => {
    const { clock, store, id, left } = storeWithClock();
    clock.at += 5 * MINUTE;
    store.pause(id);

    store.addMinute(id);
    clock.at += 3 * MINUTE;

    expect(left()).toBe(11 * MINUTE);
  });

  it('изтекъл таймер не се слага на пауза', () => {
    const { clock, store, id, current } = storeWithClock();
    clock.at += 16 * MINUTE;

    store.pause(id);

    expect(current().pausedAt).toBeUndefined();
  });

  it('„Повтори“ пуска същото време отначало, и от пауза', () => {
    const { clock, store, id, left, current } = storeWithClock();
    clock.at += 5 * MINUTE;
    store.pause(id);
    clock.at += MINUTE;

    store.restart(id);

    expect(current().pausedAt).toBeUndefined();
    expect(left()).toBe(15 * MINUTE);
    clock.at += MINUTE;
    expect(left()).toBe(14 * MINUTE);
  });

  it('„Отмени“ маха таймера, а другите остават', () => {
    const { store, id } = storeWithClock();
    const other = store.start({
      recipeId: 'r1',
      recipeTitle: 'Яхния',
      step: 2,
      label: '5 мин',
      durationMs: 5 * MINUTE,
    });

    store.cancel(id);

    expect(store.list().map((t) => t.id)).toEqual([other.id]);
  });

  it('действие уведомява абонатите, а непознат таймер не променя нищо', () => {
    const { store, id } = storeWithClock();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const before = store.list();

    store.addMinute('няма-такъв');
    expect(store.list()).toBe(before);
    expect(calls).toBe(0);

    store.addMinute(id);
    expect(calls).toBe(1);
  });
});
