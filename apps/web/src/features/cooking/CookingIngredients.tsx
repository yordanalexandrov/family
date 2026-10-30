import { type Recipe, scaleQuantity } from '@family/shared';
import { formatQuantity, formatServings } from '../../lib/format';

interface CookingIngredientsProps {
  ingredients: Recipe['ingredients'];
  /** Порциите, за които е написана рецептата. */
  recipeServings: number;
  /** Порциите на екрана; количествата са мащабирани към тях. */
  servings: number;
  onServingsChange: (servings: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Колоната „Продукти“ на Готвене на широк екран (съдържанието е `CookingIngredientsBody`). Прибрана е тясна лента
 * „Продукти (N)“, която я отваря отново.
 */
export function CookingIngredients({
  ingredients,
  recipeServings,
  servings,
  onServingsChange,
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
          Продукти ({ingredients.length})
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
      <CookingIngredientsBody
        ingredients={ingredients}
        recipeServings={recipeServings}
        servings={servings}
        onServingsChange={onServingsChange}
      />
    </section>
  );
}

/**
 * Съдържанието на „Продукти“: порциите с −/+ и продуктите с количествата за тях. Едно и също в колоната на широк
 * екран и в листа на тесен.
 */
export function CookingIngredientsBody({
  ingredients,
  recipeServings,
  servings,
  onServingsChange,
}: Pick<
  CookingIngredientsProps,
  'ingredients' | 'recipeServings' | 'servings' | 'onServingsChange'
>) {
  return (
    <>
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
      <ul className="cooking-ingredients__lines" aria-label="Продукти">
        {ingredients.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: един продукт може да е на два реда, а редовете нямат id.
          <li key={index} className="cooking-ingredients__line">
            <span>{line.ingredient.name}</span>
            <span className="cooking-ingredients__amount">
              {formatQuantity(scaleQuantity(line, recipeServings, servings))}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
