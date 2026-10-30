import { type CSSProperties, useRef } from 'react';
import { COOKING_TEXT_SIZES, useCookingTextSize } from './cooking-memory';

/** Толкова px хоризонтално плъзгане сменя стъпката. */
const SWIPE_MIN_PX = 50;

interface CookingStepsProps {
  steps: string[];
  /** Индексът на текущата стъпка, от 0. */
  step: number;
  onStepChange: (step: number) => void;
  /** „Затвори“ от всяка стъпка: излизане от Готвене. */
  onClose: () => void;
  /** „Готово“ на последната стъпка: Готвене е свършило. */
  onDone: () => void;
}

/** Стъпките на Готвене една по една: „Стъпка X от N“, едър текст с A−/A+, „Назад“ и „Напред“/„Готово“, точки за прескачане и плъзгане наляво/надясно. */
export function CookingSteps({
  steps,
  step,
  onStepChange,
  onClose,
  onDone,
}: CookingStepsProps) {
  const last = step === steps.length - 1;
  const go = (to: number) => {
    if (to >= 0 && to < steps.length && to !== step) {
      onStepChange(to);
    }
  };
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [textSize, setTextSize] = useCookingTextSize();
  const sizeIndex = COOKING_TEXT_SIZES.indexOf(
    textSize as (typeof COOKING_TEXT_SIZES)[number],
  );
  return (
    <section
      className="cooking-steps"
      aria-label="Стъпки"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = touch
          ? { x: touch.clientX, y: touch.clientY }
          : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch) {
          return;
        }
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        // Само ясно хоризонтален жест; вертикалният превърта дълга стъпка.
        if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
          go(dx < 0 ? step + 1 : step - 1);
        }
      }}
    >
      <header className="cooking-steps__head">
        <p className="cooking-steps__count">
          Стъпка {step + 1} от {steps.length}
        </p>
        <div className="cooking-steps__tools">
          <button
            type="button"
            className="button button--quiet cooking-steps__size"
            aria-label="По-дребен текст"
            disabled={sizeIndex <= 0}
            onClick={() =>
              setTextSize(COOKING_TEXT_SIZES[sizeIndex - 1] ?? textSize)
            }
          >
            A−
          </button>
          <button
            type="button"
            className="button button--quiet cooking-steps__size"
            aria-label="По-едър текст"
            disabled={sizeIndex >= COOKING_TEXT_SIZES.length - 1}
            onClick={() =>
              setTextSize(COOKING_TEXT_SIZES[sizeIndex + 1] ?? textSize)
            }
          >
            A+
          </button>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
          >
            Затвори
          </button>
        </div>
      </header>
      {/* `key` по стъпката: нова стъпка е нов елемент, така че дълга стъпка не наследява превъртането на предишната. */}
      <p
        key={step}
        className="cooking-steps__text"
        style={{ '--cooking-text-scale': textSize } as CSSProperties}
      >
        {steps[step]}
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: група бутони, не полета на форма; fieldset носи рамка и min-content ширина. */}
      <div className="cooking-steps__dots" role="group" aria-label="Към стъпка">
        {steps.map((_, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: стъпките нямат id, а редът им е смисълът.
            key={index}
            type="button"
            className="cooking-steps__dot"
            aria-label={`Стъпка ${index + 1}`}
            aria-current={index === step ? 'step' : undefined}
            onClick={() => go(index)}
          />
        ))}
      </div>
      <div className="cooking-steps__nav">
        <button
          type="button"
          className="button button--quiet cooking-steps__button"
          disabled={step === 0}
          onClick={() => go(step - 1)}
        >
          Назад
        </button>
        {last ? (
          <button
            type="button"
            className="button cooking-steps__button"
            onClick={onDone}
          >
            Готово
          </button>
        ) : (
          <button
            type="button"
            className="button cooking-steps__button"
            onClick={() => go(step + 1)}
          >
            Напред
          </button>
        )}
      </div>
    </section>
  );
}
