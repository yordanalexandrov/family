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
import { ListenButton } from './ListeningControls';
import { ReadStepButton, ReadStepsToggle } from './ReadAloudControls';
import { findStepLines } from './step-ingredients';
import { useCookingChanges } from './use-cooking-changes';
import { useCookingListening } from './use-cooking-listening';
import { useCookingQuestions } from './use-cooking-questions';
import { useCookingReading, useReadNewAnswers } from './use-cooking-reading';
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
 * само на екрана, стъпката, отметките, въпросите и приложените промени за готвенето се помнят на устройството до края
 * на деня или до „Готово“, а дали колоната е отворена — на устройството. „Питай“ отваря листа „Въпрос“ (GLOSSARY:
 * Въпрос в Готвене); зададените въпроси и заявките им живеят тук, над листа: отговорът на чакащия се вижда при следващото
 * отваряне, а при „Чети стъпките“ се чете сам и при затворен лист.
 */
export function CookingView({ recipe, servings, onExit }: CookingViewProps) {
  const [shownServings, setShownServings] = useState(
    servings ?? recipe.servings,
  );
  const {
    step,
    setStep,
    used,
    toggleUsed,
    forgetUsed,
    prepared,
    togglePrepared,
    finish,
  } = useCookingProgress(recipe);
  const changes = useCookingChanges(recipe, forgetUsed);
  const reading = useCookingReading(changes.steps, step);
  const listening = useCookingListening({
    stepCount: changes.steps.length,
    step,
    onStepChange: setStep,
    reading,
  });
  const [ingredientsOpen, setIngredientsOpen] = useIngredientsOpen();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const questions = useCookingQuestions(recipe.id);
  useReadNewAnswers(
    questions.results.map((result) => result.data),
    reading,
  );
  const wide = useMediaQuery(SHEET_WINDOW_QUERY, true);
  const products: CookingProducts = {
    lines: changes.lines,
    servings: shownServings,
    onServingsChange: setShownServings,
    step,
    // Върху показаното: текстът на стъпката и редовете с приложените промени.
    stepLines: findStepLines(changes.steps[step]?.text ?? '', changes.lines),
    used,
    onToggleUsed: toggleUsed,
  };

  const steps = (
    <CookingSteps
      recipe={recipe}
      steps={changes.steps}
      step={step}
      onStepChange={setStep}
      onClose={() => onExit()}
      onDone={() => onExit(finish)}
      ask={<AskButton open={askOpen} onOpen={() => setAskOpen(true)} />}
      readStep={<ReadStepButton reading={reading} />}
      listen={<ListenButton listening={listening} />}
      readSteps={<ReadStepsToggle reading={reading} />}
      preparation={
        <CookingPreparation
          preparation={recipe.preparation}
          prepared={prepared}
          onToggle={togglePrepared}
        />
      }
    />
  );

  // Въпросът е за стъпката, порциите и приложените промени в момента на питането; „Опитай пак“ е за стъпката на
  // неуспешния (`useCookingQuestions`), с порциите и промените в момента.
  const questionSheet = askOpen && (
    <CookingQuestionSheet
      recipe={recipe}
      questions={questions}
      step={step}
      changes={changes}
      servings={shownServings}
      reading={reading}
      onAsk={(question, replaces) =>
        questions.ask(
          {
            question,
            step,
            servings: shownServings,
            applied: changes.appliedIds,
          },
          replaces,
        )
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
