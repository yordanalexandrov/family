import { useEffect, useRef, useState } from 'react';
import {
  formatExpired,
  isExpired,
  isPaused,
  MINUTE_MS,
  msToNextChange,
  remainingMs,
  type Timer,
  timerLabel,
} from './timer-store';
import { useAlarmSound, useTimers } from './use-timers';
import './timers.css';

/** Толкова звучи изтекъл таймер; банерът остава до „Спри“. */
const ALARM_SOUND_MS = 2 * MINUTE_MS;

/** Вибрацията при изтичане (ms вибрира, пауза, вибрира…), където я има. */
const VIBRATION = [400, 200, 400, 200, 400];

/** Едно изтичане на таймер: „+1 мин“ и „Повтори“ дават ново изтичане на същия таймер. */
function expiry(timer: Timer): string {
  return `${timer.id}:${timer.endsAt}`;
}

/**
 * Откога звъни изтекъл таймер: от изтичането или, ако е изтекъл, докато Готвене е било затворено, от отварянето.
 */
function ringingSince(timer: Timer, openedAt: number): number {
  return Math.max(timer.endsAt, openedAt);
}

/**
 * Какво казва банерът след надписа: „— времето изтече“, а за интервал („10–15 мин“), който звъни на долната граница,
 * „Провери — още до 5 мин“. След първата минута (напр. изтекъл, докато Готвене е било затворено) — „— изтече преди
 * N мин“: изтеклият таймер е само в банера, не и в лентата.
 */
function alarmText(timer: Timer, now: number): string {
  const prefix = timer.maxDurationMs === undefined ? '—' : 'Провери —';
  const expired = formatExpired(remainingMs(timer, now));
  if (expired !== 'Изтече') {
    return `${prefix} ${expired.toLowerCase()}`;
  }
  if (timer.maxDurationMs === undefined) {
    return '— времето изтече';
  }
  const extraMs = timer.maxDurationMs - timer.durationMs;
  const extra =
    extraMs < MINUTE_MS
      ? `${Math.round(extraMs / 1000)} сек`
      : `${Math.round(extraMs / MINUTE_MS)} мин`;
  return `Провери — още до ${extra}`;
}

interface TimerAlarmsProps {
  /** Рецептата в Готвене: таймерите от други рецепти носят заглавието си. */
  recipeId: string;
}

/**
 * Сигналът на изтеклите таймери, докато Готвене е отворено: банер за всеки („Стъпка 2 · 20 мин — времето изтече“),
 * подредени един под друг в област, която превърта, ако са повече, отколкото събира, и повтарящ се тон до 2 минути. „Спри“ маха таймера; „+1 мин“ и „Повтори“ го пускат
 * отново (и спират звука до новото изтичане). Гласовата команда „спри“ само заглушава тона (`silence`, помни се с таймера): банерите остават.
 */
export function TimerAlarms({ recipeId }: TimerAlarmsProps) {
  const { timers, addMinute, restart, cancel } = useTimers();
  const sound = useAlarmSound();
  const [openedAt] = useState(Date.now);
  const [, setTick] = useState(0);
  const now = Date.now();
  const expired = timers.filter((timer) => isExpired(timer, now));
  // Заглушеното с „спри“ (гласова команда) не звучи; „+1 мин“ и „Повтори“ дават ново изтичане, което звъни.
  const ringing = expired.some(
    (timer) =>
      !timer.silenced && now < ringingSince(timer, openedAt) + ALARM_SOUND_MS,
  );

  // Пречертава се в следващия момент, в който нещо се сменя: изтичане на работещ таймер, край на звука или нова
  // минута в „изтече преди N мин“.
  useEffect(() => {
    const moments = timers.flatMap((timer) => {
      if (isPaused(timer)) {
        return [];
      }
      const soundEnds = ringingSince(timer, openedAt) + ALARM_SOUND_MS;
      const nextMinute = isExpired(timer, now)
        ? [now + msToNextChange(remainingMs(timer, now))]
        : [];
      return [timer.endsAt, soundEnds, ...nextMinute].filter(
        (moment) => moment > now,
      );
    });
    if (moments.length === 0) {
      return;
    }
    const timeout = setTimeout(
      () => setTick((tick) => tick + 1),
      Math.min(...moments) - now,
    );
    return () => clearTimeout(timeout);
  });

  useEffect(() => {
    if (ringing) {
      sound.play();
    } else {
      sound.stop();
    }
  }, [ringing, sound]);

  useEffect(() => () => sound.stop(), [sound]);

  // След презареждане звукът е заключен (няма докосване, което пусна таймера): отключва го всяко докосване.
  useEffect(() => {
    if (!ringing) {
      return;
    }
    const unlock = () => sound.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [ringing, sound]);

  // Вибрира веднъж за всяко ново изтичане.
  const vibrated = useRef(new Set<string>());
  const expiries = expired.map(expiry).join(' ');
  useEffect(() => {
    const fresh = expiries
      .split(' ')
      .filter((key) => key && !vibrated.current.has(key));
    if (fresh.length === 0) {
      return;
    }
    for (const key of fresh) {
      vibrated.current.add(key);
    }
    navigator.vibrate?.(VIBRATION);
  }, [expiries]);

  if (expired.length === 0) {
    return null;
  }
  return (
    <div className="timer-alarms">
      {expired.map((timer) => (
        <div key={timer.id} role="alert" className="timer-alarm">
          <p className="timer-alarm__text">
            <span className="timer-alarm__label">
              {timerLabel(timer, recipeId)}
            </span>{' '}
            <span className="timer-alarm__what">{alarmText(timer, now)}</span>
          </p>
          <div className="timer-alarm__actions">
            <button
              type="button"
              className="button timer-alarm__stop"
              onClick={() => cancel(timer.id)}
            >
              Спри
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => addMinute(timer.id)}
            >
              +1 мин
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => restart(timer.id)}
            >
              Повтори
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
