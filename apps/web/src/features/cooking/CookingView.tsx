import type { Recipe } from '@family/shared';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { SHEET_WINDOW_QUERY } from '../../components/sheet-drag';
import { useMediaQuery } from '../../lib/use-media-query';
import { AskButton } from './AskButton';
import { type CookingProducts, productsLabel } from './CookingChecklist';
import {
  CookingIngredients,
  CookingIngredientsBody,
} from './CookingIngredients';
import { CookingPreparation } from './CookingPreparation';
import { CookingQuestionSheet } from './CookingQuestionSheet';
import { CookingSteps } from './CookingSteps';
import { useCookingProgress, useIngredientsOpen } from './cooking-memory';
import { useCookingQuestions } from './use-cooking-questions';
import './cooking.css';

interface CookingViewProps {
  recipe: Recipe;
  /** Порциите при влизане (напр. на ястието); без тях — порциите на рецептата. */
  servings?: number;
  /**
   * „Готово“ на последната стъпка и „Затвори“: връщане там, откъдето си влязъл. `onLeave` се вика точно преди
   * излизането (може и да не стане: потвърждението при работещ таймер).
   */
  onExit: (onLeave?: () => void) => void;
}

/**
 * Готвене (GLOSSARY). На широк екран колоната „Продукти“ е вляво, една стъпка вдясно; на тесен (телефон изправен)
 * стъпката е на целия екран, а продуктите са в лист отдолу зад бутона „Продукти (N)“. Границата е тази на листа:
 * от нея нагоре той е прозорец, не лист отдолу. Нищо не стига до сървъра: порциите и дали листът е отворен живеят
 * само на екрана, стъпката, отметките и въпросите се помнят на устройството до края на деня или до „Готово“, а дали колоната е отворена — на
 * устройството. „Питай“ отваря листа „Въпрос“ (GLOSSARY: Въпрос в Готвене); чакащият отговор живее тук, над листа.
 */
export function CookingView({ recipe, servings, onExit }: CookingViewProps) {
  const [shownServings, setShownServings] = useState(
    servings ?? recipe.servings,
  );
  const { step, setStep, used, toggleUsed, prepared, togglePrepared, finish } =
    useCookingProgress(recipe);
  const [ingredientsOpen, setIngredientsOpen] = useIngredientsOpen();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const questions = useCookingQuestions(recipe.id);
  const wide = useMediaQuery(SHEET_WINDOW_QUERY, true);
  const products: CookingProducts = {
    ingredients: recipe.ingredients,
    recipeServings: recipe.servings,
    servings: shownServings,
    onServingsChange: setShownServings,
    used,
    onToggleUsed: toggleUsed,
  };

  const steps = (
    <CookingSteps
      recipe={recipe}
      step={step}
      onStepChange={setStep}
      onClose={() => onExit()}
      onDone={() => onExit(finish)}
      ask={<AskButton open={askOpen} onOpen={() => setAskOpen(true)} />}
      preparation={
        <CookingPreparation
          preparation={recipe.preparation}
          prepared={prepared}
          onToggle={togglePrepared}
        />
      }
    />
  );

  // Въпросът е за стъпката и порциите в момента на питането, и „Опитай пак“ също.
  const questionSheet = askOpen && (
    <CookingQuestionSheet
      recipe={recipe}
      questions={questions}
      onAsk={(question, replaces) =>
        questions.ask({ question, step, servings: shownServings }, replaces)
      }
      onClose={() => setAskOpen(false)}
    />
  );

  if (!wide) {
    return (
      <main className="cooking cooking--narrow" aria-label={recipe.title}>
        <button
          type="button"
          className="button button--quiet cooking__ingredients-button"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          {productsLabel(products)}
        </button>
        {steps}
        {sheetOpen && (
          <Sheet title="Продукти" onClose={() => setSheetOpen(false)}>
            <div className="sheet__section">
              <CookingIngredientsBody products={products} />
            </div>
          </Sheet>
        )}
        {questionSheet}
      </main>
    );
  }

  return (
    <main
      className={`cooking${ingredientsOpen ? '' : ' cooking--closed'}`}
      aria-label={recipe.title}
    >
      <CookingIngredients
        products={products}
        open={ingredientsOpen}
        onOpenChange={setIngredientsOpen}
      />
      {steps}
      {questionSheet}
    </main>
  );
}
