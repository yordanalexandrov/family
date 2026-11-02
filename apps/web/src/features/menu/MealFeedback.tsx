import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { CookingFeedbackSheet } from '../recipes/CookingFeedbackSheet';
import { useRecipe } from '../recipes/queries';

/**
 * „Как мина?“ от ястието в менюто (GLOSSARY: Обратна връзка след готвене): ястието носи само заглавието и оценката на
 * рецептата, затова листът първо чете цялата рецепта. „Пропусни“ и „Изпрати“ само затварят листа: менюто остава.
 * Докато рецептата идва, няма лист: смяна на един лист с друг би оставила записа на първия в историята (`useSheetHistory`).
 * Затова и листът с грешката е без „Опитай пак“: затваря се и „Как мина?“ се докосва пак.
 */
export function MealFeedbackSheet({
  recipeId,
  onClose,
}: {
  recipeId: string;
  onClose: () => void;
}) {
  const recipe = useRecipe(recipeId);
  if (recipe.data) {
    return (
      <CookingFeedbackSheet
        recipe={recipe.data}
        onDone={onClose}
        onClose={onClose}
      />
    );
  }
  if (recipe.isError) {
    return (
      <Sheet title="Как мина?" onClose={onClose}>
        <div className="sheet__section">
          <ErrorBox error={recipe.error} />
        </div>
      </Sheet>
    );
  }
  return null;
}
