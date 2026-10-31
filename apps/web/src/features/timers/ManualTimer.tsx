import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { formatMinutes } from '../recipes/format';
import { MINUTE_MS, type TimerSource } from './timer-store';
import { useTimers } from './use-timers';
import './timers.css';

/** Бутоните, с които се избира времето: без клавиатура, само добавяне на минути. */
const STEPS_MIN = [1, 5, 10];

interface ManualTimerProps {
  /** Рецептата и стъпката, под които е бутонът: надписът на пуснатия таймер („Таймер · Стъпка N“). */
  source: TimerSource;
}

/**
 * „⏱ Таймер“ под стъпката: ръчен таймер, когато в текста няма време или трябва друго. Отваря лист с избраното време
 * (от 0), „+1/+5/+10 мин“, „Нулирай“ и „Пусни“ (неактивен при 0), който пуска таймера и затваря листа.
 */
export function ManualTimer({ source }: ManualTimerProps) {
  const { start } = useTimers();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const close = () => {
    setOpen(false);
    setMinutes(0);
  };
  return (
    <>
      <button
        type="button"
        className="button button--quiet manual-timer__open"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⏱</span> Таймер
      </button>
      {open && (
        <Sheet title="Таймер" closeLabel="Затвори" onClose={close}>
          <div className="sheet__section manual-timer">
            <output className="manual-timer__time" aria-live="polite">
              {formatMinutes(minutes)}
            </output>
            <div className="manual-timer__add">
              {STEPS_MIN.map((step) => (
                <button
                  key={step}
                  type="button"
                  className="button button--quiet"
                  onClick={() => setMinutes((current) => current + step)}
                >
                  +{step} мин
                </button>
              ))}
              <button
                type="button"
                className="button button--quiet"
                disabled={minutes === 0}
                onClick={() => setMinutes(0)}
              >
                Нулирай
              </button>
            </div>
            <button
              type="button"
              className="button manual-timer__start"
              disabled={minutes === 0}
              onClick={() => {
                start({
                  ...source,
                  label: formatMinutes(minutes),
                  durationMs: minutes * MINUTE_MS,
                  manual: true,
                });
                close();
              }}
            >
              Пусни
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
