import {
  addDays,
  dateKeyInSofia,
  startOfDayInSofia,
  storedTimersSchema,
} from '@family/shared';
import { logger } from '../../logger';

/**
 * Таймерите (GLOSSARY: Таймер) на устройството: общи за всички рецепти, затова живеят над Готвене (`TimersProvider`
 * в `App`), а не в екрана на една рецепта. Store-ът е обикновен обект без React, за да се тества и разширява
 * (действия, запомняне, сигнал) без екрана.
 */

export const MINUTE_MS = 60_000;

/** Откъде е таймерът: рецептата и стъпката, за надписа („Стъпка 2 · 15 мин“). */
export interface TimerSource {
  recipeId: string;
  /** Заглавието на рецептата, за надпис в Готвене на друга рецепта. */
  recipeTitle: string;
  /** Индексът на стъпката, от 0. */
  step: number;
  /** От време в отговора на въпрос в Готвене, не в текста на стъпката: надписът е „Въпрос · 10 мин“. */
  question?: true;
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

/**
 * Изтеклите и неспрени таймери изчезват в края на деня по софийско време: остава само изтеклият днес. Работещ (и
 * започнал вчера, напр. в 23:50 за 30 мин) и на пауза остават.
 */
function isStale(timer: Timer, at: number): boolean {
  return (
    isExpired(timer, at) &&
    timer.endsAt < startOfDayInSofia(new Date(at)).getTime()
  );
}

/**
 * Таймерите от localStorage без изтеклите от предишен ден; липсващ запис — празно, повреден или недостъпен — празно и
 * предупреждение.
 */
function readTimers(): readonly Timer[] {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) {
      return [];
    }
    const stored = storedTimersSchema.safeParse(JSON.parse(raw));
    if (!stored.success) {
      logger.warn('Таймерите на устройството са повредени', raw);
      return [];
    }
    const timers: readonly Timer[] = stored.data;
    const at = Date.now();
    return timers.filter((timer) => !isStale(timer, at));
  } catch (error) {
    logger.warn('Таймерите на устройството не се прочетоха', error);
    return [];
  }
}

/** Записва целите таймери, с всички полета (напр. паузата), за да продължат както са били. */
function writeTimers(timers: readonly Timer[]): void {
  try {
    localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
  } catch (error) {
    logger.warn('Таймерите на устройството не се записаха', error);
  }
}

/** Колко ms остават до следващата полунощ в София. */
function msToMidnight(at: number): number {
  const tomorrow = addDays(dateKeyInSofia(new Date(at)), 1);
  return startOfDayInSofia(tomorrow).getTime() - at;
}

export function createTimerStore(): TimerStore {
  // Таймерите се помнят на устройството (localStorage): преживяват презареждане и заспиване, без сървър.
  let timers: readonly Timer[] = readTimers();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function set(next: readonly Timer[]): void {
    timers = next;
    writeTimers(next);
    notify();
  }

  /** Сменя един таймер; непознат `id` или същият обект — без промяна и без уведомяване. */
  function change(id: string, update: (timer: Timer, at: number) => Timer) {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index === -1) {
      return;
    }
    const before = timers[index] as Timer;
    const after = update(before, Date.now());
    if (after !== before) {
      set(timers.with(index, after));
    }
  }

  function running({ pausedAt, ...timer }: Timer): Timer {
    return timer;
  }

  /** Друг таб е записал таймерите: този ги взема, без да пише обратно. */
  function onStorage(event: StorageEvent): void {
    if (event.key === TIMERS_KEY || event.key === null) {
      timers = readTimers();
      notify();
    }
  }

  // Докато някой гледа таймерите (отворено приложение, kiosk без презареждане), в полунощ изтеклите от деня изчезват.
  let midnight: ReturnType<typeof setTimeout> | undefined;
  function scheduleMidnight(): void {
    midnight = setTimeout(() => {
      const at = Date.now();
      if (timers.some((timer) => isStale(timer, at))) {
        set(timers.filter((timer) => !isStale(timer, at)));
      }
      scheduleMidnight();
    }, msToMidnight(Date.now()));
  }

  return {
    list: () => timers,
    start(input) {
      const timer: Timer = {
        ...input,
        id: crypto.randomUUID(),
        endsAt: Date.now() + input.durationMs,
      };
      set([...timers, timer]);
      return timer;
    },
    addMinute(id) {
      change(id, (timer, at) => ({
        ...timer,
        endsAt: isExpired(timer, at)
          ? at + MINUTE_MS
          : timer.endsAt + MINUTE_MS,
      }));
    },
    pause(id) {
      change(id, (timer, at) =>
        isPaused(timer) || isExpired(timer, at)
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
      if (listeners.size === 0) {
        window.addEventListener('storage', onStorage);
        scheduleMidnight();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          window.removeEventListener('storage', onStorage);
          clearTimeout(midnight);
        }
      };
    },
  };
}

/** Колко остава до изтичане към `now` (на пауза — към момента на паузата); 0 или по-малко — изтекъл. */
export function remainingMs(timer: Timer, now: number): number {
  return timer.endsAt - (timer.pausedAt ?? now);
}

/** Изтекъл към `now`: оставащото е 0 или по-малко. Таймер на пауза не изтича. */
export function isExpired(timer: Timer, now: number): boolean {
  return remainingMs(timer, now) <= 0;
}

/** На пауза: не брои и не се сменя. */
export function isPaused(timer: Timer): boolean {
  return timer.pausedAt !== undefined;
}

/**
 * Таймерът звъни или ще звъни само докато Готвене е отворено, затова излизането с него иска потвърждение, а kiosk не
 * се връща сам на дашборда. Активен е и изтеклият, още неспрян таймер (звънящ); на пауза не може да звънне и не е.
 */
export function isActiveTimer(timer: Timer): boolean {
  return !isPaused(timer);
}

/** Времето на таймера в лентата и в менюто му: оставащото („14:59“) или „Изтече (преди N мин)“. */
export function timerTime(timer: Timer, now: number): string {
  const left = remainingMs(timer, now);
  return left > 0 ? formatRemaining(left) : formatExpired(left);
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
 * Надписът на таймера в Готвене на `recipeId`: стъпката и времето („Стъпка 2 · 15 мин“), за ръчен „Таймер · Стъпка 2“,
 * а от отговор на въпрос „Въпрос · 10 мин“; пред тях заглавието на рецептата, ако таймерът е от друга.
 */
export function timerLabel(timer: Timer, recipeId: string): string {
  const own = timer.manual
    ? `Таймер · Стъпка ${timer.step + 1}`
    : timer.question
      ? `Въпрос · ${timer.label}`
      : `Стъпка ${timer.step + 1} · ${timer.label}`;
  return timer.recipeId === recipeId ? own : `${timer.recipeTitle} · ${own}`;
}
