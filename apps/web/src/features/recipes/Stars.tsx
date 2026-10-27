import type { Rating } from '@family/shared';
import { useId } from 'react';
import './stars.css';

const STARS = [1, 2, 3, 4, 5] as const;
const MAX = STARS.length;

/** „4 от 5“ или „Неоценена“: как звучи оценката (GLOSSARY: Оценка) за екранен четец. */
export function ratingText(rating: Rating | null): string {
  return rating === null ? 'Неоценена' : `${rating} от ${MAX}`;
}

interface RatingStarsProps {
  rating: Rating | null;
  /** `null` маха оценката: втори натиск на същата звезда. */
  onRate: (rating: Rating | null) => void;
  /** Името на групата; по подразбиране „Оценка“. */
  label?: string;
  disabled?: boolean;
}

/** Пет звезди, които поставят оценката на рецептата; натискане на избраната я маха. Докосване ≥ 44 px. */
export function RatingStars({
  rating,
  onRate,
  label = 'Оценка',
  disabled = false,
}: RatingStarsProps) {
  const descriptionId = useId();
  return (
    <fieldset
      aria-label={label}
      aria-describedby={descriptionId}
      className="stars"
    >
      <span id={descriptionId} className="visually-hidden">
        {ratingText(rating)}
      </span>
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          className={`stars__star${rating !== null && star <= rating ? ' stars__star--on' : ''}`}
          aria-label={`${star} от ${MAX}`}
          aria-pressed={star === rating}
          disabled={disabled}
          onClick={() => onRate(star === rating ? null : star)}
        >
          <span aria-hidden="true">
            {rating !== null && star <= rating ? '★' : '☆'}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

/** Оценката само за четене (до заглавието в списъка); неоценена рецепта не показва нищо. */
export function StarsBadge({ rating }: { rating: Rating | null }) {
  if (rating === null) {
    return null;
  }
  return (
    <span
      className="stars-badge"
      role="img"
      aria-label={`Оценка ${ratingText(rating)}`}
    >
      {STARS.map((star) => (star <= rating ? '★' : '☆')).join('')}
    </span>
  );
}
