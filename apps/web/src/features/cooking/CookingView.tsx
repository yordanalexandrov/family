import type { Recipe } from '@family/shared';
import { useState } from 'react';
import { CookingIngredients } from './CookingIngredients';
import { CookingSteps } from './CookingSteps';
import './cooking.css';

interface CookingViewProps {
  recipe: Recipe;
  /** Порциите при влизане (напр. на ястието); без тях — порциите на рецептата. */
  servings?: number;
  /** „Готово“ на последната стъпка и „Затвори“: връщане там, откъдето си влязъл. */
  onExit: () => void;
}

/**
 * Готвене (GLOSSARY) на широк екран: колоната „Продукти“ вляво, една стъпка вдясно. Нищо не се записва: порциите,
 * стъпката и дали колоната е отворена живеят само на екрана.
 */
export function CookingView({ recipe, servings, onExit }: CookingViewProps) {
  const [shownServings, setShownServings] = useState(
    servings ?? recipe.servings,
  );
  const [step, setStep] = useState(0);
  const [ingredientsOpen, setIngredientsOpen] = useState(true);

  return (
    <main
      className={`cooking${ingredientsOpen ? '' : ' cooking--closed'}`}
      aria-label={recipe.title}
    >
      <CookingIngredients
        ingredients={recipe.ingredients}
        recipeServings={recipe.servings}
        servings={shownServings}
        onServingsChange={setShownServings}
        open={ingredientsOpen}
        onOpenChange={setIngredientsOpen}
      />
      <CookingSteps
        steps={recipe.steps}
        step={step}
        onStepChange={setStep}
        onExit={onExit}
      />
    </main>
  );
}
