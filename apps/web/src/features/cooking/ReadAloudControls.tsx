import type { CookingReading } from './use-cooking-reading';

/** 🔊 до A−/A+ в Готвене: чете текущата стъпка. Без български глас го няма. */
export function ReadStepButton({ reading }: { reading: CookingReading }) {
  if (!reading.available) {
    return null;
  }
  return (
    <button
      type="button"
      className="button button--quiet cooking-steps__size"
      aria-label="Прочети стъпката"
      onClick={reading.readStep}
    >
      🔊
    </button>
  );
}

/**
 * „Чети стъпките“ под стъпката, до „⏱ Таймер“: превключвател (`aria-pressed`), с който всяка нова стъпка се чете сама.
 * Без български глас го няма.
 */
export function ReadStepsToggle({ reading }: { reading: CookingReading }) {
  if (!reading.available) {
    return null;
  }
  return (
    <button
      type="button"
      className="button button--quiet cooking-steps__read-steps"
      aria-pressed={reading.readSteps}
      onClick={() => reading.setReadSteps(!reading.readSteps)}
    >
      Чети стъпките
    </button>
  );
}
