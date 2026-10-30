import { formatServings } from '../../lib/format';
import {
  CookingChecklist,
  type CookingProducts,
  productsLabel,
} from './CookingChecklist';

interface CookingIngredientsProps {
  products: CookingProducts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Колоната „Продукти“ на Готвене на широк екран (съдържанието е `CookingIngredientsBody`). Прибрана е тясна лента
 * „Продукти (N)“, която я отваря отново.
 */
export function CookingIngredients({
  products,
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
          {productsLabel(products)}
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
      <CookingIngredientsBody products={products} />
    </section>
  );
}

/**
 * Съдържанието на „Продукти“: порциите с −/+ и продуктите с количествата за тях, с отметки. Едно и също в колоната на широк
 * екран и в листа на тесен.
 */
export function CookingIngredientsBody({
  products,
}: {
  products: CookingProducts;
}) {
  const { servings, onServingsChange } = products;
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
      <CookingChecklist products={products} />
    </>
  );
}
