import {
  type DateKey,
  isPastMeal,
  type Meal,
  type MealPlan,
  mealTitle,
} from '@family/shared';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { formatDayLong } from '../../lib/format';
import { useSwapMeals } from './queries';
import './MoveMeal.css';

interface MoveMealProps {
  meal: Meal;
  plan: MealPlan;
  today: DateKey;
}

/**
 * „Размени с…“ в листа на ястието: избор на ден от днес нататък (без текущия), с чието ястие това разменя дните си.
 * Всеки чип показва датата и под нея ястието на деня (или „празно“), за да се види с какво е размяната. Пътят с
 * клавиатура и екранен четец за влаченето на редовете.
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
        <fieldset className="sheet__section" aria-label="Размени с">
          <legend className="field__label">Размени с</legend>
          <div className="chips">
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                className="chip move-meal__chip"
                disabled={swap.isPending}
                onClick={() =>
                  swap.mutate(
                    { meal, withMeal: target },
                    { onSuccess: () => setChoosing(false) },
                  )
                }
              >
                <span>{formatDayLong(target.date)}</span>{' '}
                <span className="move-meal__dish">
                  {mealTitle(target) ?? 'празно'}
                </span>
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
            Размени с…
          </button>
        </div>
      )}
    </>
  );
}
