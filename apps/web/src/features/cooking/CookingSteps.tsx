import {
  type RecipeStep,
  STEP_PHOTO_MAX_SIDE,
  stepPhotoUrl,
} from '@family/shared';
import { useRef } from 'react';

/** Толкова px хоризонтално плъзгане сменя стъпката. */
const SWIPE_MIN_PX = 50;

/** Ширините (`?w=`), от които браузърът избира снимката на стъпката по екрана си; най-широката е пазената снимка. */
const PHOTO_WIDTHS = [640, 1024, STEP_PHOTO_MAX_SIDE];

/**
 * Колко широка е снимката на екрана: на широк (kiosk хоризонтално) половината от стъпката до колоната „Продукти“,
 * на тесен (телефон) цялата ширина над текста. Границата е тази на `CookingView` (`SHEET_WINDOW_QUERY`).
 */
const PHOTO_SIZES = '(min-width: 48rem) 34vw, 100vw';

interface CookingStepsProps {
  steps: RecipeStep[];
  /** Индексът на текущата стъпка, от 0. */
  step: number;
  onStepChange: (step: number) => void;
  /** „Затвори“ от всяка стъпка: излизане от Готвене. */
  onClose: () => void;
  /** „Готово“ на последната стъпка: Готвене е свършило. */
  onDone: () => void;
}

/** Стъпките на Готвене една по една: „Стъпка X от N“, едър текст (със снимката на стъпката, ако има), „Назад“ и „Напред“/„Готово“, точки за прескачане и плъзгане наляво/надясно. */
export function CookingSteps({
  steps,
  step,
  onStepChange,
  onClose,
  onDone,
}: CookingStepsProps) {
  const last = step === steps.length - 1;
  const current = steps[step];
  const photoId = current?.photoId;
  const go = (to: number) => {
    if (to >= 0 && to < steps.length && to !== step) {
      onStepChange(to);
    }
  };
  const touchStart = useRef<{ x: number; y: number } | null>(null);
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
        <button
          type="button"
          className="button button--quiet"
          onClick={onClose}
        >
          Затвори
        </button>
      </header>
      <div
        className={`cooking-steps__body${photoId ? ' cooking-steps__body--photo' : ''}`}
      >
        {photoId && (
          <img
            // Новата стъпка не показва старата снимка, докато своята се зарежда.
            key={photoId}
            className="cooking-steps__photo"
            src={stepPhotoUrl(photoId, PHOTO_WIDTHS[1])}
            srcSet={PHOTO_WIDTHS.map(
              (width) => `${stepPhotoUrl(photoId, width)} ${width}w`,
            ).join(', ')}
            sizes={PHOTO_SIZES}
            alt={`Снимката на стъпка ${step + 1}`}
            decoding="async"
          />
        )}
        <p className="cooking-steps__text">{current?.text}</p>
      </div>
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
