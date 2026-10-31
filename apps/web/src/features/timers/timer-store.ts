/**
 * Таймерите (GLOSSARY: Таймер) на устройството: общи за всички рецепти, затова живеят над Готвене (`TimersProvider`
 * в `App`), а не в екрана на една рецепта. Store-ът е обикновен обект без React, с часовник отвън (`now`), за да се
 * тества и разширява (действия, запомняне, сигнал) без екрана.
 */

/** Откъде е таймерът: рецептата и стъпката, за надписа („Стъпка 2 · 15 мин“). */
export interface TimerSource {
  recipeId: string;
  /** Заглавието на рецептата, за надпис в Готвене на друга рецепта. */
  recipeTitle: string;
  /** Индексът на стъпката, от 0. */
  step: number;
}

/** Какво е нужно, за да се пусне таймер. */
export interface NewTimer extends TimerSource {
  /** Времето, както е в текста („15 мин“, „10–15 мин“). */
  label: string;
  /** До колко брои; за интервал — долната граница. */
  durationMs: number;
  /** Горната граница на интервал („10–15 мин“), за „още до N мин“ при изтичане. */
  maxDurationMs?: number;
  /** Ръчен таймер („⏱ Таймер“ под стъпката), не от време в текста: надписът е „Таймер · Стъпка N“. */
  manual?: true;
}

export interface Timer extends NewTimer {
  id: string;
  /** Моментът на изтичане (ms от epoch). Крайният момент, не оставащото време: брои вярно и след заспиване. */
  endsAt: number;
}

export interface TimerStore {
  /** Таймерите по реда на пускане; същият масив, докато нищо не се промени (`useSyncExternalStore`). */
  list(): readonly Timer[];
  start(timer: NewTimer): Timer;
  subscribe(listener: () => void): () => void;
}

interface TimerStoreOptions {
  /** Часовникът; тестовете подменят `Date` с фалшив часовник, не тази опция. */
  now?: () => number;
}

export function createTimerStore({
  now = Date.now,
}: TimerStoreOptions = {}): TimerStore {
  let timers: readonly Timer[] = [];
  const listeners = new Set<() => void>();

  function set(next: readonly Timer[]): void {
    timers = next;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    list: () => timers,
    start(input) {
      const timer: Timer = {
        ...input,
        id: crypto.randomUUID(),
        endsAt: now() + input.durationMs,
      };
      set([...timers, timer]);
      return timer;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Колко остава до изтичане към `now`; 0 или по-малко — изтекъл. */
export function remainingMs(timer: Timer, now: number): number {
  return timer.endsAt - now;
}

/** Оставащото време като на часовник: „14:59“, „1:05:00“; закръглено нагоре до секунда. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * Надписът на таймера в Готвене на `recipeId`: стъпката и времето („Стъпка 2 · 15 мин“) или за ръчен „Таймер · Стъпка
 * 2“, а пред тях заглавието на рецептата, ако таймерът е от друга.
 */
export function timerLabel(timer: Timer, recipeId: string): string {
  const own = timer.manual
    ? `Таймер · Стъпка ${timer.step + 1}`
    : `Стъпка ${timer.step + 1} · ${timer.label}`;
  return timer.recipeId === recipeId ? own : `${timer.recipeTitle} · ${own}`;
}
