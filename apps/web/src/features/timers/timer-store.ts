import { type DateKey, dateKeyInSofia } from '@family/shared';
import { logger } from '../../logger';

/**
 * Таймерите (GLOSSARY: Таймер) на устройството: общи за всички рецепти, затова живеят над Готвене (`TimersProvider`
 * в `App`), а не в екрана на една рецепта. Store-ът е обикновен обект без React, с часовник отвън (`now`), за да се
 * тества и разширява (действия, запомняне, сигнал) без екрана.
 */

const MINUTE_MS = 60_000;

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
}

export interface Timer extends NewTimer {
  id: string;
  /** Моментът на изтичане (ms от epoch). Крайният момент, не оставащото време: брои вярно и след заспиване. */
  endsAt: number;
  /** На пауза от този момент (ms от epoch): оставащото е `endsAt - pausedAt` и не намалява. Без него таймерът брои. */
  pausedAt?: number;
}

export interface TimerStore {
  /** Таймерите по реда на пускане; същият масив, докато нищо не се промени (`useSyncExternalStore`). */
  list(): readonly Timer[];
  start(timer: NewTimer): Timer;
  /** „+1 мин“: минута към оставащото; изтекъл таймер брои минута от сега. */
  addMinute(id: string): void;
  /** Спира броенето; изтекъл таймер не се слага на пауза. */
  pause(id: string): void;
  /** „Продължи“: брои от същото оставащо време. */
  resume(id: string): void;
  /** „Повтори“: същото време отначало, и от пауза или изтекъл. */
  restart(id: string): void;
  /** „Отмени“: маха таймера. */
  cancel(id: string): void;
  subscribe(listener: () => void): () => void;
}

export const TIMERS_KEY = 'family.timers';

/** Записът на устройството: таймерите на един ден; запис от друг ден не важи (изтеклите и неспрени изчезват). */
interface StoredTimers {
  day: DateKey;
  timers: readonly Timer[];
}

function today(): DateKey {
  return dateKeyInSofia(new Date());
}

/** Днешните таймери от localStorage; липсващ или стар запис — празно, повреден или недостъпен — празно и предупреждение. */
function readTimers(): readonly Timer[] {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) {
      return [];
    }
    const stored = JSON.parse(raw) as Partial<StoredTimers> | null;
    if (stored?.day !== today()) {
      return [];
    }
    if (!Array.isArray(stored.timers) || !stored.timers.every(isTimer)) {
      logger.warn('Таймерите на устройството са повредени', raw);
      return [];
    }
    return stored.timers;
  } catch (error) {
    logger.warn('Таймерите на устройството не се прочетоха', error);
    return [];
  }
}

/** Записва таймерите за днес — целите записи, с всички полета (напр. паузата), за да продължат както са били. */
function writeTimers(timers: readonly Timer[]): void {
  try {
    localStorage.setItem(
      TIMERS_KEY,
      JSON.stringify({ day: today(), timers } satisfies StoredTimers),
    );
  } catch (error) {
    logger.warn('Таймерите на устройството не се записаха', error);
  }
}

/** Задължителните полета на `Timer`; останалите (паузата от действията) се пазят каквито са. */
function isTimer(value: unknown): value is Timer {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const timer = value as Record<string, unknown>;
  const isNumber = (field: unknown) =>
    typeof field === 'number' && Number.isFinite(field);
  return (
    typeof timer.id === 'string' &&
    typeof timer.recipeId === 'string' &&
    typeof timer.recipeTitle === 'string' &&
    typeof timer.label === 'string' &&
    Number.isInteger(timer.step) &&
    (timer.step as number) >= 0 &&
    isNumber(timer.durationMs) &&
    (timer.maxDurationMs === undefined || isNumber(timer.maxDurationMs)) &&
    isNumber(timer.endsAt) &&
    (timer.pausedAt === undefined || isNumber(timer.pausedAt))
  );
}

interface TimerStoreOptions {
  /** Часовникът; тестовете подменят `Date` с фалшив часовник, не тази опция. */
  now?: () => number;
}

export function createTimerStore({
  now = Date.now,
}: TimerStoreOptions = {}): TimerStore {
  // Таймерите се помнят на устройството (localStorage): преживяват презареждане и заспиване, без сървър.
  let timers: readonly Timer[] = readTimers();
  const listeners = new Set<() => void>();

  function set(next: readonly Timer[]): void {
    timers = next;
    writeTimers(next);
    for (const listener of listeners) {
      listener();
    }
  }

  /** Сменя един таймер; непознат `id` или същият обект — без промяна и без уведомяване. */
  function change(id: string, update: (timer: Timer, at: number) => Timer) {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index === -1) {
      return;
    }
    const before = timers[index] as Timer;
    const after = update(before, now());
    if (after !== before) {
      set(timers.with(index, after));
    }
  }

  function running({ pausedAt, ...timer }: Timer): Timer {
    return timer;
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
    addMinute(id) {
      change(id, (timer, at) => ({
        ...timer,
        endsAt:
          remainingMs(timer, at) > 0
            ? timer.endsAt + MINUTE_MS
            : at + MINUTE_MS,
      }));
    },
    pause(id) {
      change(id, (timer, at) =>
        timer.pausedAt !== undefined || remainingMs(timer, at) <= 0
          ? timer
          : { ...timer, pausedAt: at },
      );
    },
    resume(id) {
      change(id, (timer, at) =>
        timer.pausedAt === undefined
          ? timer
          : running({ ...timer, endsAt: timer.endsAt + at - timer.pausedAt }),
      );
    },
    restart(id) {
      change(id, (timer, at) =>
        running({ ...timer, endsAt: at + timer.durationMs }),
      );
    },
    cancel(id) {
      if (timers.some((timer) => timer.id === id)) {
        set(timers.filter((timer) => timer.id !== id));
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Колко остава до изтичане към `now` (на пауза — към момента на паузата); 0 или по-малко — изтекъл. */
export function remainingMs(timer: Timer, now: number): number {
  return timer.endsAt - (timer.pausedAt ?? now);
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

/** Изтеклият таймер (`ms` ≤ 0 от `remainingMs`): „Изтече“ в първата минута, после „Изтече преди N мин“. */
export function formatExpired(ms: number): string {
  const minutes = Math.floor(-ms / MINUTE_MS);
  return minutes > 0 ? `Изтече преди ${minutes} мин` : 'Изтече';
}

/** След колко ms се сменя надписът на таймер с оставащо `ms`: на цяла секунда, докато брои, на цяла минута след изтичане. */
export function msToNextChange(ms: number): number {
  return ms > 0 ? ms % 1000 || 1000 : MINUTE_MS - (-ms % MINUTE_MS);
}

/**
 * Надписът на таймера в Готвене на `recipeId`: стъпката и времето („Стъпка 2 · 15 мин“), а пред тях заглавието на
 * рецептата, ако таймерът е от друга.
 */
export function timerLabel(timer: Timer, recipeId: string): string {
  const own = `Стъпка ${timer.step + 1} · ${timer.label}`;
  return timer.recipeId === recipeId ? own : `${timer.recipeTitle} · ${own}`;
}
