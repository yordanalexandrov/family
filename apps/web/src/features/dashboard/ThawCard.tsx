import type { DashboardThaw, DateKey } from '@family/shared';
import { Card } from '../../components/Card';
import { useMarkThawed } from './today-actions';
import './ThawCard.css';

interface ThawCardProps {
  /** „Извади месото“ за днешната (и вечер — за утрешната) вечеря. */
  thaw: DashboardThaw[];
  /** Днешната дата в София: продукт за друга дата е „за утре“. */
  today: DateKey;
}

/**
 * „Извади месото“ на телефона, под ядрото: продуктите „Във фризера“ за днешната
 * (и вечер — за утрешната) вечеря с „Извадих“, после отметка „извадено“. Без
 * такива продукти картата я няма.
 */
export function ThawCard({ thaw, today }: ThawCardProps) {
  if (thaw.length === 0) {
    return null;
  }
  return (
    <Card className="thaw" aria-label="Извади месото">
      <ul className="thaw__list">
        {thaw.map((item) => (
          <ThawRow key={item.mealId} item={item} today={today} />
        ))}
      </ul>
    </Card>
  );
}

/** Един ред със свое „Извадих“: докато то чака отговор, другите редове остават достъпни. */
function ThawRow({ item, today }: { item: DashboardThaw; today: DateKey }) {
  const thawed = useMarkThawed();
  return (
    <li className="thaw__item">
      <span className="thaw__text">
        {item.date === today ? 'Извади месото' : 'Извади месото за утре'}:{' '}
        {item.products.join(', ')}
      </span>
      {item.thawedAt ? (
        <span className="thaw__done">
          <span aria-hidden="true">✓</span> извадено
        </span>
      ) : (
        <button
          type="button"
          className="button thaw__action"
          disabled={thawed.isPending}
          onClick={() => thawed.mutate(item.mealId)}
        >
          Извадих
        </button>
      )}
    </li>
  );
}
