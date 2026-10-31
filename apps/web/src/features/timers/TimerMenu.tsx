import { Sheet } from '../../components/Sheet';
import {
  isExpired,
  isPaused,
  type Timer,
  timerLabel,
  timerTime,
} from './timer-store';
import { useTimers } from './use-timers';

interface TimerMenuProps {
  timer: Timer;
  /** Рецептата в Готвене, за надписа (както в лентата). */
  recipeId: string;
  /** „Сега“ от лентата: тя пречертава менюто заедно със себе си всяка секунда. */
  now: number;
  onClose: () => void;
}

/**
 * Менюто на пуснат таймер: оставащото време и „+1 мин“, „Пауза“/„Продължи“, „Повтори“, „Отмени“. „+1 мин“ и паузата
 * оставят менюто отворено, за да се види промяната; „Повтори“ и „Отмени“ го затварят. Изтекъл таймер е без пауза.
 */
export function TimerMenu({ timer, recipeId, now, onClose }: TimerMenuProps) {
  const { addMinute, pause, resume, restart, cancel } = useTimers();
  const expired = isExpired(timer, now);
  const paused = isPaused(timer);

  return (
    <Sheet title={timerLabel(timer, recipeId)} onClose={onClose}>
      <p
        className={`timer-menu__time${expired ? ' timer-menu__time--expired' : ''}`}
      >
        {timerTime(timer, now)}
        {paused && <span className="timer-menu__state"> · на пауза</span>}
      </p>
      <div className="timer-menu__actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={() => addMinute(timer.id)}
        >
          +1 мин
        </button>
        {paused ? (
          <button
            type="button"
            className="button"
            onClick={() => resume(timer.id)}
          >
            Продължи
          </button>
        ) : (
          !expired && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => pause(timer.id)}
            >
              Пауза
            </button>
          )
        )}
        <button
          type="button"
          className="button button--quiet"
          onClick={() => {
            restart(timer.id);
            onClose();
          }}
        >
          Повтори
        </button>
        <button
          type="button"
          className="button button--quiet timer-menu__cancel"
          onClick={() => {
            cancel(timer.id);
            onClose();
          }}
        >
          Отмени
        </button>
      </div>
    </Sheet>
  );
}
