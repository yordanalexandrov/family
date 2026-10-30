import type { Recipe } from '@family/shared';
import { formatServings } from '../../lib/format';
import { CookingChecklist } from './CookingChecklist';

interface CookingIngredientsProps {
  ingredients: Recipe['ingredients'];
  /** Порциите, за които е написана рецептата. */
  recipeServings: number;
  /** Порциите на екрана; количествата са мащабирани към тях. */
  servings: number;
  onServingsChange: (servings: number) => void;
  /** Индексите на отметнатите („използвани“) редове. */
  used: readonly number[];
  onToggleUsed: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Колоната „Продукти“ на Готвене: порциите с −/+ и продуктите с количествата за тях. Прибрана е тясна лента
 * „Продукти (N)“, която я отваря отново.
 */
export function CookingIngredients({
  ingredients,
  recipeServings,
  servings,
  onServingsChange,
  used,
  onToggleUsed,
  open,
  onOpenChange,
}: CookingIngredientsProps) {
  if (!open) {
    return (
      <button
        type="button"
        className="cooking-ingredients cooking-ingredients--closed"
        aria-expanded={false}
        onClick={() => onOpenChange(true)}
      >
        <span className="cooking-ingredients__strip">
          Продукти ({ingredients.length - used.length})
        </span>
      </button>
    );
  }
  return (
    <section
      id="cooking-ingredients"
      className="cooking-ingredients"
      aria-labelledby="cooking-ingredients-title"
    >
      <header className="cooking-ingredients__head">
        <h2 id="cooking-ingredients-title">Продукти</h2>
        <button
          type="button"
          className="button button--quiet cooking-ingredients__close"
          aria-expanded
          aria-controls="cooking-ingredients"
          aria-label="Прибери продуктите"
          onClick={() => onOpenChange(false)}
        >
          ‹
        </button>
      </header>
      <div className="cooking-ingredients__servings">
        <button
          type="button"
          className="button button--quiet cooking-ingredients__step"
          aria-label="Една порция по-малко"
          disabled={servings <= 1}
          onClick={() => onServingsChange(servings - 1)}
        >
          −
        </button>
        <span>за {formatServings(servings)}</span>
        <button
          type="button"
          className="button button--quiet cooking-ingredients__step"
          aria-label="Една порция повече"
          onClick={() => onServingsChange(servings + 1)}
        >
          +
        </button>
      </div>
      <CookingChecklist
        ingredients={ingredients}
        recipeServings={recipeServings}
        servings={servings}
        used={used}
        onToggleUsed={onToggleUsed}
      />
    </section>
  );
}
