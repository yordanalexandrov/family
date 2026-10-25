import type { Ingredient, Suggestion } from '@family/shared';
import {
  emptyIngredientRow,
  emptyRecipeFormValues,
  nutritionToValues,
  type RecipeFormValues,
} from '../recipes/recipe-form-values';

/**
 * Началните стойности на `RecipeForm` от предложение. `resolved` е продуктът от регистъра по име на реда
 * (точно съвпадение); ред без него остава неразрешен и откроен като нов продукт.
 */
export function suggestionToFormValues(
  suggestion: Suggestion,
  resolved: ReadonlyMap<string, Ingredient>,
): RecipeFormValues {
  return {
    ...emptyRecipeFormValues(),
    title: suggestion.title,
    servings: String(suggestion.servings),
    prepMinutes: String(suggestion.prepMinutes),
    sourceUrl: suggestion.sourceUrl,
    tags: [...suggestion.tags],
    steps: [...suggestion.steps],
    ingredients: suggestion.ingredients.map((line) => {
      const ingredient = line.isNew ? undefined : resolved.get(line.name);
      return emptyIngredientRow({
        ingredient: ingredient ?? null,
        query: ingredient?.name ?? line.name,
        quantity: line.quantity === null ? '' : String(line.quantity),
        unit: line.unit,
        ...(ingredient ? {} : { isNew: true }),
      });
    }),
    nutrition: nutritionToValues(suggestion.nutritionPer100g),
  };
}
