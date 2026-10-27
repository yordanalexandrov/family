import {
  type DateKey,
  isPastMeal,
  type Meal,
  type MealPlan,
} from '@family/shared';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { formatDayLong } from '../../lib/format';
import { useSwapMeals } from './queries';

interface MoveMealProps {
  meal: Meal;
  plan: MealPlan;
  today: DateKey;
}

/**
 * „Премести на…“ в листа на ястието: избор на ден от днес нататък (без текущия), с чието ястие това разменя дните си.
 * Пътят с клавиатура и екранен четец за влаченето на редовете.
 */
export function MoveMeal({ meal, plan, today }: MoveMealProps) {
  const [choosing, setChoosing] = useState(false);
  const swap = useSwapMeals(plan.weekStart);
  const targets = plan.meals.filter(
    (m) => m.id !== meal.id && m.slot === meal.slot && !isPastMeal(m, today),
  );

  if (targets.length === 0) {
    return null;
  }
  return (
    <>
      {swap.isError && <ErrorBox error={swap.error} />}
      {choosing ? (
        <fieldset className="sheet__section" aria-label="Премести на">
          <legend className="field__label">Премести на</legend>
          <div className="chips">
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                className="chip"
                disabled={swap.isPending}
                onClick={() =>
                  swap.mutate(
                    { meal, withMeal: target },
                    { onSuccess: () => setChoosing(false) },
                  )
                }
              >
                {formatDayLong(target.date)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="sheet__section">
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setChoosing(true)}
          >
            Премести на…
          </button>
        </div>
      )}
    </>
  );
}
