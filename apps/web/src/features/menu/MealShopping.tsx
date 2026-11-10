import type { DateKey, Meal } from '@family/shared';
import { ErrorBox } from '../../components/ErrorBox';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { useOnline } from '../../lib/use-online';
import { useSetMealListed, useShoppingWeek } from '../shopping/queries';

/**
 * Превключвателят „В списъка за пазаруване“ в листа на ястието (GLOSSARY: Ястие в списъка, ADR-0011): ястие от
 * менюто влиза в списъка за пазаруване само оттук. Включен е, ако ястието е в `listedMealIds` на списъка на
 * седмицата; без връзка е изключен с „Иска връзка“.
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
  const connection = useNeedsConnection(useOnline(), 'meal-shopping__hint');
  const listed = week.data?.list.listedMealIds.includes(meal.id) ?? false;
  return (
    <div className="meal-sheet__row meal-sheet__row--static meal-shopping">
      {setListed.isError && <ErrorBox error={setListed.error} />}
      <label className="meal-shopping__switch">
        <span className="meal-sheet__row-label">В списъка за пазаруване</span>
        <input
          type="checkbox"
          role="switch"
          checked={listed}
          aria-checked={listed}
          disabled={connection.disabled || !week.data || setListed.isPending}
          aria-describedby={connection.describedBy}
          onChange={(event) =>
            setListed.mutate({ mealId: meal.id, listed: event.target.checked })
          }
        />
      </label>
      {connection.hint}
    </div>
  );
}
