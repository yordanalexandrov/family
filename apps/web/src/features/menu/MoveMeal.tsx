import {
  type DateKey,
  isPastMeal,
  type Meal,
  type MealPlan,
  mealTitle,
} from '@family/shared';
import { ErrorBox } from '../../components/ErrorBox';
import { formatDayLong } from '../../lib/format';
import { useSwapMeals } from './queries';
import './MoveMeal.css';

/** С кои ястия може да си размени дните `meal`: от същия `slot`, от днес нататък, без самото него. */
export function swapTargetsOf(
  meal: Meal,
  plan: MealPlan,
  today: DateKey,
): Meal[] {
  return plan.meals.filter(
    (m) => m.id !== meal.id && m.slot === meal.slot && !isPastMeal(m, today),
  );
}

interface MoveMealProps {
  meal: Meal;
  plan: MealPlan;
  /** Дните, с които може да се размени (`swapTargetsOf`). */
  targets: Meal[];
  /** Размяната е минала. */
  onSwapped: () => void;
}

/**
 * „Размени с друг ден“ в листа на ястието: чиповете на дните (без текущия), с чието ястие това разменя дните си.
 * Всеки чип показва датата и под нея ястието на деня (или „празно“), за да се види с какво е размяната. Пътят с
 * клавиатура и екранен четец за влаченето на редовете.
 */
export function MoveMeal({ meal, plan, targets, onSwapped }: MoveMealProps) {
  const swap = useSwapMeals(plan.weekStart);
  return (
    <fieldset className="move-meal" aria-label="Размени с">
      {swap.isError && <ErrorBox error={swap.error} />}
      <div className="chips">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            className="chip move-meal__chip"
            disabled={swap.isPending}
            onClick={() =>
              swap.mutate({ meal, withMeal: target }, { onSuccess: onSwapped })
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
  );
}
