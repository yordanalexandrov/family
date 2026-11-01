import type { ReactNode } from 'react';
import { findStepTimes } from './step-times';
import type { TimerSource } from './timer-store';
import { useTimers } from './use-timers';
import './timers.css';

interface StepTextProps {
  text: string;
  /** Рецептата и стъпката, от които е текстът (или отговорът на въпрос): надписът на пуснатия таймер. */
  source: TimerSource;
}

/**
 * Текстът на стъпка (или отговорът на въпрос в Готвене), в който всяко разпознато време („15 мин“) е бутон „⏱ 15 мин“
 * на мястото си; останалото е непроменено.
 */
export function StepText({ text, source }: StepTextProps) {
  const { start } = useTimers();
  const parts: ReactNode[] = [];
  let from = 0;
  for (const time of findStepTimes(text)) {
    parts.push(text.slice(from, time.start));
    parts.push(
      <button
        key={time.start}
        type="button"
        className="step-time"
        aria-label={`Таймер ${time.label}`}
        onClick={() =>
          start({
            ...source,
            label: time.label,
            durationMs: time.seconds * 1000,
            ...(time.maxSeconds === undefined
              ? {}
              : { maxDurationMs: time.maxSeconds * 1000 }),
          })
        }
      >
        <span aria-hidden="true">⏱</span>
        {text.slice(time.start, time.end)}
      </button>,
    );
    from = time.end;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
