import { useEffect, useState } from 'react';
import {
  formatExpired,
  formatRemaining,
  msToNextChange,
  remainingMs,
  type Timer,
  timerLabel,
} from './timer-store';
import { useTimers } from './use-timers';
import './timers.css';

/**
 * Пречертава лентата, когато оставащото време на някой работещ таймер мине през цяла секунда (и при изтичането му), а
 * на изтекъл — през цяла минута („Изтече преди N мин“); не през интервал от монтирането, за да не изостава надписът.
 */
function useTick(timers: readonly Timer[], now: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (timers.length === 0) {
      return;
    }
    const delay = Math.min(
      ...timers.map((timer) => msToNextChange(remainingMs(timer, now))),
    );
    const timeout = setTimeout(() => setTick((tick) => tick + 1), delay);
    return () => clearTimeout(timeout);
  });
}

interface TimerStripProps {
  /** Рецептата в Готвене: таймерите от други рецепти носят заглавието си. */
  recipeId: string;
}

/** Лентата с таймерите на устройството, на всяка стъпка: надпис и оставащо време или „Изтече (преди N мин)“. Без таймери я няма. */
export function TimerStrip({ recipeId }: TimerStripProps) {
  const { timers } = useTimers();
  // Оставащото време се смята при всяко рисуване, а `useTick` го пречертава точно когато се смени надписът.
  const now = Date.now();
  useTick(timers, now);
  if (timers.length === 0) {
    return null;
  }
  return (
    <section className="timer-strip" aria-label="Таймери">
      <ul className="timer-strip__list">
        {timers.map((timer) => {
          const left = remainingMs(timer, now);
          const expired = left <= 0;
          return (
            <li
              key={timer.id}
              className={`timer-strip__timer${expired ? ' timer-strip__timer--expired' : ''}`}
            >
              <span className="timer-strip__label">
                {timerLabel(timer, recipeId)}
              </span>
              <span className="timer-strip__time">
                {expired ? formatExpired(left) : formatRemaining(left)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
