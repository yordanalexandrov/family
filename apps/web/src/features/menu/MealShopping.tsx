import type { DateKey, Meal } from '@family/shared';
import { ErrorBox } from '../../components/ErrorBox';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { useOnline } from '../../lib/use-online';
import { useSetMealListed, useShoppingWeek } from '../shopping/queries';

/**
 * „🛒 Добави в списъка“ в листа на ястието (GLOSSARY: Ястие в списъка, ADR-0011): ястие от менюто влиза в списъка
 * за пазаруване само оттук. В списъка е „🛒 В списъка ✓“ (`aria-pressed`), а повторното докосване го маха. Кое ястие е
 * в списъка идва от `listedMealIds` на списъка на седмицата; без връзка бутонът е изключен с „Иска връзка“.
 */
export function MealShopping({
  meal,
  weekStart,
}: {
  meal: Meal;
  weekStart: DateKey;
}) {
  const week = useShoppingWeek(weekStart);
  const setListed = useSetMealListed(weekStart);
  const connection = useNeedsConnection(useOnline());
  const listed = week.data?.list.listedMealIds.includes(meal.id) ?? false;
  return (
    <div className="sheet__section">
      {setListed.isError && <ErrorBox error={setListed.error} />}
      <button
        type="button"
        className="button button--quiet"
        aria-pressed={listed}
        disabled={connection.disabled || !week.data || setListed.isPending}
        aria-describedby={connection.describedBy}
        onClick={() => setListed.mutate({ mealId: meal.id, listed: !listed })}
      >
        {listed ? '🛒 В списъка ✓' : '🛒 Добави в списъка'}
      </button>
      {connection.hint}
    </div>
  );
}
