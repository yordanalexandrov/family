import {
  CookingChecklist,
  type CookingProducts,
  productsLabel,
} from './CookingChecklist';
import { ServingsStepper } from './ServingsStepper';

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
 * Съдържанието на „Продукти“: порциите с −/+ и продуктите с количествата за тях, с отметки; компонентите със своите
 * броячи са под главните редове (`CookingChecklist`). Едно и също в колоната на широк екран и в листа на тесен.
 */
export function CookingIngredientsBody({
  products,
}: {
  products: CookingProducts;
}) {
  return (
    <>
      <ServingsStepper
        servings={products.servings.recipe}
        onChange={products.onServingsChange}
      />
      <CookingChecklist products={products} />
    </>
  );
}
